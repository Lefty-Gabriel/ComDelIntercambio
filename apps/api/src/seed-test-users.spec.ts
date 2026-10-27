import { describe, expect, it, vi } from 'vitest';
import { ensureTestAccount } from '../../../scripts/seed-test-users.mjs';

const account = { email: 'estudiante.pruebas@traction.test', password: 'generated-secret', role: 'estudiante', fullName: 'Test Student' };
function adapter(existing: any = null) {
  return {
    lookup: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({ id: 'new-id' }),
    setRole: vi.fn().mockResolvedValue(undefined),
    getRole: vi.fn().mockResolvedValue('estudiante'),
    verify: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}
describe('dedicated test account seed', () => {
  it('creates a confirmed owned account and applies the application role', async () => {
    const api = adapter();
    await expect(ensureTestAccount(api, account, 'owner')).resolves.toBe('new-id');
    expect(api.create).toHaveBeenCalledWith(account, 'owner');
    expect(api.setRole).toHaveBeenCalledWith('new-id', 'estudiante');
  });
  it('reuses an owned account without changing its password or profile', async () => {
    const api = adapter({ id: 'existing', app_metadata: { test_seed_owner: 'owner' } });
    await expect(ensureTestAccount(api, account, 'owner')).resolves.toBe('existing');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.setRole).not.toHaveBeenCalled();
  });
  it('creates the support fixture with the support profile role', async () => {
    const api = adapter();
    const support = { ...account, email: 'soporte.pruebas@traction.test', role: 'soporte', fullName: 'Test Support' };
    await expect(ensureTestAccount(api, support, 'owner')).resolves.toBe('new-id');
    expect(api.setRole).toHaveBeenCalledWith('new-id', 'soporte');
  });
  it('refuses an email collision with an unrelated account', async () => {
    const api = adapter({ id: 'real-user', app_metadata: {} });
    await expect(ensureTestAccount(api, account, 'owner')).rejects.toThrow('collision');
    expect(api.setRole).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('refuses changed roles on an owned account', async () => {
    const api = adapter({ id: 'existing', app_metadata: { test_seed_owner: 'owner' } });
    api.getRole.mockResolvedValue('admin');
    await expect(ensureTestAccount(api, account, 'owner')).rejects.toThrow('role');
    expect(api.setRole).not.toHaveBeenCalled();
  });
  it('refuses a locally stored password that no longer works', async () => {
    const api = adapter({ id: 'existing', app_metadata: { test_seed_owner: 'owner' } });
    api.verify.mockResolvedValue(false);
    await expect(ensureTestAccount(api, account, 'owner')).rejects.toThrow('credentials');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('compensates only its just-created user if profile setup fails', async () => {
    const api = adapter();
    api.setRole.mockRejectedValue(new Error('profile unavailable'));
    await expect(ensureTestAccount(api, account, 'owner')).rejects.toThrow('profile unavailable');
    expect(api.remove).toHaveBeenCalledWith('new-id');
  });
});
