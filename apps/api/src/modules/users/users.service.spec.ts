import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service.js';

describe('personal mentor assignment', () => {
  function setup(profiles = [{ id: 'student', role: 'estudiante' }, { id: 'mentor', role: 'mentor' }]) {
    const query: any = {
      select: () => query,
      in: async () => ({ data: profiles, error: null }),
      upsert: vi.fn(() => query),
      single: async () => ({ data: { student_id: 'student', mentor_id: 'mentor' }, error: null }),
    };
    return { query, service: new UsersService({ client: { schema: () => ({ from: () => query }) } } as any) };
  }
  it('replaces the assignment by student identity', async () => {
    const { service, query } = setup();
    expect(await service.assignMentor('student', 'mentor', { id: 'admin', role: 'admin' } as any)).toEqual({ studentId: 'student', mentorId: 'mentor' });
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ student_id: 'student', mentor_id: 'mentor', assigned_by: 'admin' }), { onConflict: 'student_id' });
  });
  it.each(['estudiante', 'mentor', 'soporte'])('denies assignment by %s', async role => {
    const { service, query } = setup();
    await expect(service.assignMentor('student', 'mentor', { role } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.upsert).not.toHaveBeenCalled();
  });
  it('rejects accounts with invalid roles', async () => {
    const { service, query } = setup([{ id: 'student', role: 'estudiante' }, { id: 'mentor', role: 'admin' }]);
    await expect(service.assignMentor('student', 'mentor', { role: 'admin' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(query.upsert).not.toHaveBeenCalled();
  });
});
