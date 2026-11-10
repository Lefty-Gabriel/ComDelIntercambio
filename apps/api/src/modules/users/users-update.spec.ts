import { UsersService } from './users.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
describe('administrator profile editing', () => {
  function setup(found = true) {
    const query: any = { update: vi.fn(() => query), eq: () => query, select: () => query,
      maybeSingle: async () => ({ data: found ? { id: 'target', full_name: 'Daniel', role: 'mentor', email: 'mentor@example.test' } : null, error: null }) };
    return { service: new UsersService({ client: { schema: () => ({ from: () => query }) } } as any), query };
  }
  it('persists only permitted display fields and preserves credentials and roles', async () => {
    const { service, query } = setup();
    const result = await service.update('target', { fullName: ' Daniel ', company: ' Empresa ', role: 'admin', email: 'changed@test.com' } as any, { id: 'admin', role: 'admin' } as any);
    expect(query.update).toHaveBeenCalledWith({ full_name: 'Daniel', company: 'Empresa', updated_at: expect.any(String) });
    expect(result.fullName).toBe('Daniel');
    expect(result.role).toBe('mentor');
  });
  it.each(['mentor', 'estudiante', 'soporte'])('rejects %s without writes', async role => {
    const { service, query } = setup();
    await expect(service.update('target', { fullName: 'Daniel' }, { role } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.update).not.toHaveBeenCalled();
  });
  it('rejects missing accounts', async () => {
    await expect(setup(false).service.update('missing', { fullName: 'Daniel' }, { role: 'admin' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
