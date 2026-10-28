import { AdministrationService } from './administration.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { AccessInputDto, LessonInputDto } from './administration.dto.js';
import { validate } from 'class-validator';
const admin: any = { id: 'admin', role: 'admin' };
describe('administrative content and access boundaries', () => {
  it.each(['mentor', 'estudiante', 'soporte'])(
    'denies %s every administrative operation before touching data',
    async (role) => {
      const service = new AdministrationService({} as any);
      const actor = { id: 'actor', role } as any;
      for (const operation of [
        () => service.curriculum(actor, 'course'),
        () =>
          service.saveModule(actor, 'course', { title: 'Module', position: 0 }),
        () => service.saveLesson(actor, 'module', {} as any),
        () => service.listAccess(actor, {}),
        () => service.grantAccess(actor, {} as any),
      ])
        await expect(operation()).rejects.toThrow();
    },
  );
  it('rejects an access expiry in the past', async () => {
    const service = new AdministrationService({} as any);
    await expect(
      service.grantAccess(admin, {
        courseId: 'course',
        studentId: 'student',
        accessType: 'full',
        status: 'active',
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('futura');
  });
  it('rejects linking a video from another course', async () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: { course_id: 'other', status: 'ready' },
        error: null,
      }),
    };
    const service = new AdministrationService({
      client: { schema: () => ({ from: () => query }) },
    } as any);
    vi.spyOn(service as any, 'module').mockResolvedValue({
      course_id: 'course',
    });
    await expect(
      service.saveLesson(admin, 'module', {
        title: 'Lesson',
        position: 0,
        durationMinutes: 5,
        isPublished: true,
        videoId: 'video',
      }),
    ).rejects.toThrow('mismo curso');
  });
  it('does not move a lesson to another course through its URL', async () => {
    const service = new AdministrationService({} as any);
    vi.spyOn(service as any, 'module').mockResolvedValue({
      course_id: 'course',
    });
    vi.spyOn(service as any, 'lesson').mockResolvedValue({
      module_id: 'other-module',
    });
    await expect(
      service.saveLesson(admin, 'module', { title: 'Lesson' } as any, 'lesson'),
    ).rejects.toThrow('pertenece');
  });
  it('does not reactivate or replace a suspended student enrollment through the mentor path', async () => {
    let table = '';
    const upsert = vi.fn();
    const query: any = {
      select: () => query,
      eq: () => query,
      upsert,
      maybeSingle: async () => ({
        data:
          table === 'profiles'
            ? { role: 'estudiante' }
            : {
                id: 'enrollment',
                course_id: 'course',
                status: 'suspended',
                access_type: 'content',
              },
        error: null,
      }),
    };
    const courses = new CoursesService({
      client: {
        schema: () => ({
          from: (name: string) => {
            table = name;
            return query;
          },
        }),
      },
    } as any);
    vi.spyOn(courses, 'getCourseDocenteId').mockResolvedValue('mentor');
    await expect(
      courses.enroll('course', 'student', {
        id: 'mentor',
        role: 'mentor',
      } as any),
    ).rejects.toThrow('suspendido');
    expect(upsert).not.toHaveBeenCalled();
  });
  it('keeps an existing content-only active enrollment when enrolling again', async () => {
    let table = '';
    const upsert = vi.fn();
    const existing = {
      id: 'enrollment',
      course_id: 'course',
      status: 'active',
      access_type: 'content',
      expires_at: null,
    };
    const query: any = {
      select: () => query,
      eq: () => query,
      upsert,
      maybeSingle: async () => ({
        data: table === 'profiles' ? { role: 'estudiante' } : existing,
        error: null,
      }),
    };
    const courses = new CoursesService({
      client: {
        schema: () => ({
          from: (name: string) => {
            table = name;
            return query;
          },
        }),
      },
    } as any);
    expect(await courses.enroll('course', 'student', admin)).toEqual(existing);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('validates access modes and rejects negative curriculum positions', async () => {
    expect(
      (
        await validate(
          Object.assign(new AccessInputDto(), {
            accessType: 'unrestricted',
            status: 'active',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          Object.assign(new LessonInputDto(), {
            title: 'Lesson',
            position: -1,
            durationMinutes: 5,
            isPublished: false,
          }),
        )
      ).some((error) => error.property === 'position'),
    ).toBe(true);
  });
});
