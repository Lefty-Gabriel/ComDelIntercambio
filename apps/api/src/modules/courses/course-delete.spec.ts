import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service.js';

describe('course deletion', () => {
  function setup(data: unknown = { id: 'course' }, error: unknown = null) {
    const query: any = { delete: vi.fn(() => query), eq: vi.fn(() => query), select: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data, error })) };
    const from = vi.fn(() => query);
    const service = new CoursesService({ client: { schema: () => ({ from }) } } as any);
    return { service, query, from };
  }
  it.each(['estudiante', 'mentor', 'soporte'])('refuses %s before deleting data', async role => {
    const { service, from } = setup();
    await expect(service.remove('course', { id: 'actor', role } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(from).not.toHaveBeenCalled();
  });
  it('deletes only the requested course for an administrator', async () => {
    const { service, query, from } = setup();
    await expect(service.remove('course', { id: 'admin', role: 'admin' } as any)).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith('courses');
    expect(query.eq).toHaveBeenCalledWith('id', 'course');
  });
  it('reports database errors and missing courses', async () => {
    await expect(setup(null, { message: 'Deletion failed' }).service.remove('course', { role: 'admin' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(null).service.remove('course', { role: 'admin' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
