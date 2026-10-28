import { StudentDashboardService } from './student-dashboard.service.js';
import { CreateLiveSessionDto } from '../video/dto/create-live-session.dto.js';
import { validate } from 'class-validator';
const user: any = { id: 'student', role: 'estudiante' };
function setup(enrolled = true) {
  const upsert = vi.fn(async () => ({ error: null }));
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { lesson_id: 'lesson', position_seconds: 42 },
      error: null,
    }),
    upsert,
  };
  const service = new StudentDashboardService(
    { client: { schema: () => ({ from: () => query }) } } as any,
    { isEnrolled: async () => enrolled } as any,
  );
  return { service, upsert };
}
describe('student resume', () => {
  it('reads the saved lesson and position for an enrolled student', async () => {
    expect(await setup().service.getResume(user, 'course')).toEqual({
      lessonId: 'lesson',
      positionSeconds: 42,
    });
  });
  it('denies access when not enrolled or when role is support', async () => {
    await expect(
      setup(false).service.getResume(user, 'course'),
    ).rejects.toThrow();
    await expect(
      setup().service.getResume({ ...user, role: 'soporte' }, 'course'),
    ).rejects.toThrow();
  });
  it('does not save a lesson belonging to a different course', async () => {
    const { service, upsert } = setup();
    vi.spyOn(service as any, 'assertStudentLessonAccess').mockResolvedValue(
      'other',
    );
    vi.spyOn(service as any, 'getPublishedLessonCourseId').mockResolvedValue(
      'other',
    );
    await expect(
      service.saveResume(user, 'course', 'lesson', 40),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('saves position only for the authenticated student', async () => {
    const { service, upsert } = setup();
    vi.spyOn(service as any, 'assertStudentLessonAccess').mockResolvedValue(
      'course',
    );
    vi.spyOn(service as any, 'getPublishedLessonCourseId').mockResolvedValue(
      'course',
    );
    await service.saveResume(user, 'course', 'lesson', 40);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      student_id: 'student',
      course_id: 'course',
      lesson_id: 'lesson',
      position_seconds: 40,
    });
  });
});
describe('Zoom scheduling validation', () => {
  it.each([
    'https://zoom.us/j/123',
    'https://company.zoom.us/j/123?pwd=secret',
    'https://zoom.com/j/123',
  ])('accepts %s', async (joinUrl) => {
    const dto = Object.assign(new CreateLiveSessionDto(), {
      courseId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Class',
      scheduledAt: '2026-11-01T12:00:00Z',
      durationMinutes: 60,
      joinUrl,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each([
    'javascript:alert(1)',
    'https://zoom.us.evil.com/j/1',
    'http://zoom.us/j/1',
    'https://zoom.us@evil.com/j/1',
  ])('rejects %s', async (joinUrl) => {
    const dto = Object.assign(new CreateLiveSessionDto(), { joinUrl });
    expect(
      (await validate(dto)).some((error) => error.property === 'joinUrl'),
    ).toBe(true);
  });
});
