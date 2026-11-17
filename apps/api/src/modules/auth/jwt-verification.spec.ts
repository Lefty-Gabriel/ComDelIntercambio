import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('cryptographic session validation', () => {
  let privateKey: CryptoKey;
  let keys: ReturnType<typeof createLocalJWKSet>;
  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test' }] });
  });
  async function token(options: { issuer?: string; audience?: string; expired?: boolean; missingExpiration?: boolean } = {}) {
    let jwt = new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'ES256', kid: 'test' }).setSubject('account').setIssuer(options.issuer || 'https://test.supabase.co/auth/v1').setAudience(options.audience || 'authenticated').setIssuedAt();
    if (!options.missingExpiration) jwt = jwt.setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : '5m');
    return jwt.sign(privateKey);
  }
  function setup(role = 'estudiante') {
    const single = vi.fn(async () => ({ data: { id: 'account', role, email: 'test@example.com', full_name: 'Test' }, error: null }));
    const guard = new JwtAuthGuard({ get: () => 'https://test.supabase.co' } as any, { client: { schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }) } } as any);
    (guard as any).jwks = keys;
    const request: any = { headers: {} };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    return { guard, request, context, single };
  }
  it.each(['estudiante', 'mentor', 'admin', 'soporte'])('uses the database role for %s instead of the token role', async role => {
    const { guard, request, context } = setup(role);
    request.headers.authorization = `Bearer ${await token()}`;
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user.role).toBe(role);
  });
  it('rejects an active account lock even with a valid signed token', async () => {
    const { guard, request, context, single } = setup();
    single.mockResolvedValueOnce({ data: { id:'account', role:'estudiante', email:'test@example.com', full_name:'Test', login_locked_until:new Date(Date.now()+60000).toISOString() }, error:null } as any);
    request.headers.authorization = `Bearer ${await token()}`;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });
  it.each([
    { issuer: 'https://other.supabase.co/auth/v1' }, { audience: 'service_role' }, { expired: true }, { missingExpiration: true },
  ])('rejects invalid session claims %j before accessing data', async options => {
    const { guard, request, context, single } = setup();
    request.headers.authorization = `Bearer ${await token(options)}`;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(single).not.toHaveBeenCalled();
  });
  it.each([undefined, 'Bearer invalid', 'Basic credentials'])('rejects missing or malformed credentials %s', async authorization => {
    const { guard, request, context, single } = setup();
    request.headers.authorization = authorization;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(single).not.toHaveBeenCalled();
  });
});
