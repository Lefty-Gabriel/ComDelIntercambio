import { AuthService } from './auth.service.js';
import { LoginSecurity, securityKey } from './login-security.js';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('persistent login protection', () => {
  function setup() {
    const signInWithPassword = vi.fn(async () => ({
      data: { session: null },
      error: { code: 'invalid_credentials', status: 400 },
    }));
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'begin_login' ? { lease: 'lease' } : { blocked: false },
      error: null,
    }));
    const db: any = {
      client: { schema: () => ({ rpc }) },
      anon: { auth: { signInWithPassword } },
    };
    return {
      service: new AuthService(db),
      security: new LoginSecurity(db),
      rpc,
      signInWithPassword,
    };
  }
  it('uses normalized hashed identifiers, never plaintext passwords', () => {
    expect(securityKey('account', ' TEST@EXAMPLE.COM ')).toBe(
      securityKey('account', 'test@example.com'),
    );
    expect(securityKey('account', 'test@example.com')).not.toContain(
      'test@example.com',
    );
  });
  it('does not call the provider for a locked account', async () => {
    const { service, rpc, signInWithPassword } = setup();
    rpc.mockResolvedValueOnce({ data: { blocked: true }, error: null } as any);
    await expect(
      service.login({ email: 'test@example.com', password: 'secret' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('rejects concurrent attempts while the database lease is active', async () => {
    const { security, rpc } = setup();
    rpc.mockResolvedValueOnce({ data: { busy: true }, error: null } as any);
    await expect(security.begin('test@example.com')).rejects.toMatchObject({
      status: 429,
    });
  });
  it('counts provider credential failures and returns 429 on the fifth', async () => {
    const { service, rpc } = setup();
    rpc
      .mockResolvedValueOnce({ data: { lease: 'lease' }, error: null })
      .mockResolvedValueOnce({ data: { blocked: true }, error: null } as any);
    await expect(
      service.login({ email: 'test@example.com', password: 'secret' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(rpc).toHaveBeenLastCalledWith(
      'finish_login',
      expect.objectContaining({ p_success: false, p_count_failure: true }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('secret');
  });
  it('releases the lease without counting a network failure as a wrong password', async () => {
    const { service, rpc, signInWithPassword } = setup();
    signInWithPassword.mockRejectedValueOnce(new Error('network'));
    await expect(
      service.login({ email: 'test@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rpc).toHaveBeenLastCalledWith(
      'finish_login',
      expect.objectContaining({ p_success: false, p_count_failure: false }),
    );
  });
  it('fails closed when the counters cannot be reached', async () => {
    const { security, rpc } = setup();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'offline' },
    } as any);
    await expect(security.begin('test@example.com')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
describe('explicit four-role matrix', () => {
  for (const allowed of [
    ['admin'],
    ['estudiante'],
    ['mentor'],
    ['soporte'],
    ['admin', 'mentor'],
    ['admin', 'soporte'],
  ]) {
    it.each(['admin', 'mentor', 'estudiante', 'soporte'])(
      `${allowed.join('+')} checks %s without administrator bypass`,
      (role) => {
        const reflector = {
          getAllAndOverride: () => allowed,
        } as unknown as Reflector;
        const context: any = {
          getHandler: () => null,
          getClass: () => null,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        };
        const guard = new RolesGuard(reflector);
        if (allowed.includes(role))
          expect(guard.canActivate(context)).toBe(true);
        else
          expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      },
    );
  }
});
