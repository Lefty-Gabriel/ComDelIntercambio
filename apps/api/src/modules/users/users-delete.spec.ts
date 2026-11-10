import { UsersService } from './users.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
describe('administrator user deletion', () => {
  const admin: any = { id: 'admin', role: 'admin' };
  function setup(found = true, error: any = null) {
    const remove = vi.fn(async () => ({ error }));
    const query: any = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: found ? { id: 'target' } : null, error: null }) };
    const service = new UsersService({ client: { schema: () => ({ from: () => query }),
      auth: { admin: { deleteUser: remove } } } } as any);
    return { service, remove };
  }
  it('deletes the authentication account after checking administrator access', async () => {
    const { service, remove } = setup();
    expect(await service.remove('target', admin)).toEqual({ deleted: true, id: 'target' });
    expect(remove).toHaveBeenCalledWith('target');
  });
  it.each(['mentor', 'estudiante', 'soporte'])('rejects %s', async role => {
    const { service, remove } = setup();
    await expect(service.remove('target', { id: 'actor', role } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });
  it('prevents self-deletion and rejects missing users', async () => {
    const { service, remove } = setup(false);
    await expect(service.remove('admin', admin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not report success when Auth deletion fails', async () => {
    await expect(setup(true, { message: 'storage ownership' }).service.remove('target', admin)).rejects.toThrow('No se pudo eliminar');
  });
});
