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

describe('Zoom link updates', () => {
  it('denies changes by a mentor assigned to another course', async () => {
    const update = vi.fn();
    const service = new LiveSessionsService(
      { client: { schema: () => ({ from: () => ({ update }) }) } } as any,
      { getCourseDocenteId: async () => 'other-mentor' } as any,
    );
    vi.spyOn(service as any, 'getRowOrFail').mockResolvedValue({
      course_id: 'course',
    });
    await expect(
      service.updateJoinLink(
        actor('mentor'),
        'session',
        'https://zoom.us/j/123',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('scheduled class editing', () => {
  function setup(teacher = 'mentor', status = 'scheduled') {
    const row = { id: 'session', course_id: 'course', title: 'Updated', status,
      scheduled_at: '2099-11-01T15:00:00Z', duration_minutes: 90, join_url: null };
    const query: any = { update: vi.fn(() => query), eq: () => query,
      select: () => query, single: async () => ({ data: row, error: null }) };
    const service = new LiveSessionsService(
      { client: { schema: () => ({ from: () => query }) } } as any,
      { getCourseDocenteId: async () => teacher } as any);
    vi.spyOn(service as any, 'getRowOrFail').mockResolvedValue(row);
    return { service, query, input: { courseId: 'course', title: row.title,
      scheduledAt: row.scheduled_at, durationMinutes: 90, joinUrl: '' } };
  }
  it('persists schedule, title, duration and cleared link for the assigned mentor', async () => {
    const { service, query, input } = setup();
    const result = await service.update(actor('mentor'), 'session', input);
    expect(query.update).toHaveBeenCalledWith({ title: 'Updated',
      scheduled_at: input.scheduledAt, duration_minutes: 90, join_url: null });
    expect(result.durationMinutes).toBe(90);
  });
  it('normalizes meeting ID, saves the guest passcode and permits clearing both', async () => {
    const { service, query, input } = setup();
    await service.update(actor('mentor'), 'session', { ...input, meetingId: '123 4567 8901', meetingPasscode: ' Guest123 ' });
    expect(query.update).toHaveBeenLastCalledWith(expect.objectContaining({ meeting_id: '12345678901', meeting_passcode: 'Guest123' }));
    await service.update(actor('mentor'), 'session', { ...input, meetingId: '', meetingPasscode: '' });
    expect(query.update).toHaveBeenLastCalledWith(expect.objectContaining({ meeting_id: null, meeting_passcode: null }));
  });
  it('rejects another mentor without writing', async () => {
    const { service, query, input } = setup('other');
    await expect(service.update(actor('mentor'), 'session', input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.update).not.toHaveBeenCalled();
  });
  it('rejects moving a class or editing an ended class', async () => {
    const { service, query, input } = setup();
    await expect(service.update(actor('mentor'), 'session', { ...input, courseId: 'other' })).rejects.toThrow('curso');
    expect(query.update).not.toHaveBeenCalled();
    const ended = setup('mentor', 'ended');
    await expect(ended.service.update(actor('mentor'), 'session', ended.input)).rejects.toThrow('finalizada');
    expect(ended.query.update).not.toHaveBeenCalled();
  });
});
