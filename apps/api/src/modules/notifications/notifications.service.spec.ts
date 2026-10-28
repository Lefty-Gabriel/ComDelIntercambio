import { NotificationsService } from './notifications.service.js';
const actor = (role = 'mentor') => ({ id: 'actor', role }) as any;
function setup() {
  const insert = vi.fn(() => query);
  const upsert = vi.fn(async () => ({ error: null }));
  const query: any = {
    insert,
    upsert,
    select: () => query,
    single: async () => ({ data: { id: 'notice' }, error: null }),
  };
  const rpc = vi.fn(async () => ({
    data: [
      { id: 'live:visible', type: 'live', title: 'Class', is_read: false },
    ],
    error: null,
  }));
  const courses = { assertCanManageCourse: vi.fn(async () => {}) };
  const service = new NotificationsService(
    { client: { schema: () => ({ from: () => query, rpc }) } } as any,
    courses as any,
  );
  return { service, insert, upsert, rpc, courses };
}
describe('academic notifications', () => {
  const input: any = {
    courseId: 'course',
    title: 'New event',
    body: 'Details',
    kind: 'event',
  };
  it('uses the authenticated user for the scoped feed', async () => {
    const { service, rpc } = setup();
    await service.list(actor());
    expect(rpc).toHaveBeenCalledWith('notification_feed', {
      p_user_id: 'actor',
    });
  });
  it('does not request academic notifications for support', async () => {
    const { service, rpc } = setup();
    expect(await service.list(actor('soporte'))).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('only marks visible notifications for the authenticated user', async () => {
    const { service, upsert } = setup();
    await service.markRead(actor(), ['live:visible', 'live:other']);
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        user_id: 'actor',
        notification_id: 'live:visible',
      }),
    ]);
  });
  it('lets mentors publish directly in their assigned courses', async () => {
    const { service, courses, insert } = setup();
    await service.publish(actor(), input);
    expect(courses.assertCanManageCourse).toHaveBeenCalledWith(
      'course',
      actor(),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: 'course',
        is_published: true,
        created_by: 'actor',
      }),
    );
  });
  it('blocks mentors global publications and publications in unrelated courses', async () => {
    const { service, courses, insert } = setup();
    await expect(
      service.publish(actor(), { ...input, courseId: undefined }),
    ).rejects.toThrow();
    courses.assertCanManageCourse.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.publish(actor(), input)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it.each(['estudiante', 'soporte'])(
    'blocks publication by %s',
    async (role) => {
      const { service, insert } = setup();
      await expect(service.publish(actor(role), input)).rejects.toThrow();
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it('allows administrators to publish a community event', async () => {
    const { service, insert } = setup();
    await service.publish(actor('admin'), { ...input, courseId: undefined });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ course_id: null, kind: 'event' }),
    );
  });
  it('rejects already expired notices', async () => {
    const { service, insert } = setup();
    await expect(
      service.publish(actor('admin'), {
        ...input,
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
