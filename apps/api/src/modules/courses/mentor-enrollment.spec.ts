import { CoursesService } from './courses.service.js';
import { ForbiddenException } from '@nestjs/common';
const actor = (role = 'mentor') => ({ id: 'mentor', role }) as any;
function setup(assigned = true, targetRole = 'estudiante') {
  let filter: any = {};
  let saved: any;
  const query: any = {
    select: () => query,
    eq: (key: string, value: any) => {
      filter[key] = value;
      return query;
    },
    maybeSingle: async () => ({
      data: { id: 'student', role: targetRole },
      error: null,
    }),
    upsert: (input: any) => {
      saved = input;
      return query;
    },
    single: async () => ({ data: saved, error: null }),
  };
  const service = new CoursesService({
    client: { schema: () => ({ from: () => query }) },
  } as any);
  vi.spyOn(service, 'getCourseDocenteId').mockResolvedValue(
    assigned ? 'mentor' : 'other',
  );
  return { service, saved: () => saved, filters: () => filter };
}
describe('mentor enrollment autonomy', () => {
  it('allows assigned mentors to enroll students and activate their enrollment', async () => {
    const { service, saved } = setup();
    await service.enroll('course', 'student', actor());
    expect(saved()).toMatchObject({
      course_id: 'course',
      student_id: 'student',
      granted_by: 'mentor',
      status: 'active',
    });
  });
  it('denies a mentor access to another mentor course before looking up students', async () => {
    const { service, saved, filters } = setup(false);
    await expect(
      service.enrollByEmail('course', 'student@example.com', actor()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved()).toBeUndefined();
    expect(filters()).toEqual({});
  });
  it.each(['mentor', 'admin', 'soporte'])(
    'does not enroll a target with role %s',
    async (role) => {
      const { service, saved } = setup(true, role);
      await expect(
        service.enroll('course', 'target', actor()),
      ).rejects.toThrow();
      expect(saved()).toBeUndefined();
    },
  );
  it('normalizes the exact email and restricts the lookup to student profiles', async () => {
    const { service, filters } = setup();
    await service.enrollByEmail('course', ' STUDENT@EXAMPLE.COM ', actor());
    expect(filters()).toMatchObject({
      email: 'student@example.com',
      role: 'estudiante',
    });
  });
  it.each(['estudiante', 'soporte'])(
    'denies %s enrollment management',
    async (role) => {
      await expect(
        setup().service.enroll('course', 'student', actor(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
