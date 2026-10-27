import { LiveSessionsService } from './live-sessions.service.js';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
const actor = (role: string) => ({ id: 'mentor', role }) as AuthenticatedUser;
describe('provider-free session scheduling', () => {
  const row = {
    id: 'session',
    course_id: 'course',
    title: 'Class',
    status: 'scheduled',
    scheduled_at: '2026-11-01T12:00:00Z',
    duration_minutes: 60,
  };
  function setup() {
    const insert = vi.fn(() => query);
    const query: any = {
      insert,
      select: () => query,
      single: async () => ({ data: row, error: null }),
    };
    const service = new LiveSessionsService(
      { client: { schema: () => ({ from: () => query }) } } as any,
      { getCourseDocenteId: async () => 'mentor' } as any,
    );
    return { service, insert };
  }
  it('creates a scheduled session without provisioning a video room', async () => {
    const { service, insert } = setup();
    const result = await service.create(actor('mentor'), {
      courseId: 'course',
      title: 'Class',
      scheduledAt: row.scheduled_at,
      durationMinutes: 60,
    });
    expect(result.scheduledAt).toBe(row.scheduled_at);
    expect(result.durationMinutes).toBe(60);
    expect(insert.mock.calls[0][0]).not.toHaveProperty('room_name');
    expect(result).not.toHaveProperty('roomName');
  });
  it.each(['estudiante', 'soporte'])('denies %s scheduling', async (role) => {
    await expect(
      setup().service.create(actor(role), {
        courseId: 'course',
        title: 'Class',
        scheduledAt: row.scheduled_at,
        durationMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
