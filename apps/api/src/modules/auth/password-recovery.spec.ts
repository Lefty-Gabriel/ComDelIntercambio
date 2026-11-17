import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
const recoveryToken = (method = 'recovery') =>
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ amr: [{ method }] })).toString('base64url') +
  '.signature';
describe('password recovery', () => {
  function setup() {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'verified-user', email: 'user@example.com' } },
      error: null,
    }));
    const updateUserById = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const insert = vi.fn(async () => ({ error: null }));
    return {
      rpc,
      resetPasswordForEmail,
      getUser,
      updateUserById,
      service: new AuthService({
        anon: { auth: { resetPasswordForEmail, getUser } },
        client: {
          schema: () => ({ rpc, from: () => ({ insert }) }),
          auth: { admin: { updateUserById } },
        },
      } as any),
    };
  }
  it('uses a fixed frontend redirect and does not disclose account existence', async () => {
    const { service, resetPasswordForEmail } = setup();
    expect(await service.recoverPassword(' User@Example.com ')).toEqual({
      message: expect.stringContaining('Si el correo está registrado'),
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: expect.stringMatching(
        /\/recuperar-contrasena\?challenge=[a-f0-9]{64}$/,
      ),
    });
  });
  it('updates only the identity verified by Supabase', async () => {
    const { service, getUser, updateUserById } = setup();
    await service.resetPassword(
      recoveryToken(),
      'new-password',
      'a'.repeat(64),
    );
    expect(getUser).toHaveBeenCalledWith(recoveryToken());
    expect(updateUserById).toHaveBeenCalledWith('verified-user', {
      password: 'new-password',
    });
  });
  it('rejects invalid or expired recovery credentials before any password change', async () => {
    const { service, getUser, updateUserById } = setup();
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'expired' },
    } as any);
    await expect(
      service.resetPassword('invalid-token', 'new-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it('rejects an ordinary login token even if its identity is valid', async () => {
    const { service, updateUserById } = setup();
    await expect(
      service.resetPassword(recoveryToken('password'), 'new-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it('rejects an expired, used or other-account challenge', async () => {
    const { service, rpc, updateUserById } = setup();
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(
      service.resetPassword(recoveryToken(), 'new-password', 'a'.repeat(64)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
