import { validate } from 'class-validator';
import { ReadNotificationsDto } from './notifications.dto.js';
describe('notification read identifiers', () => {
  it('accepts persisted support events and academic notifications', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const input = Object.assign(new ReadNotificationsDto(), { ids: [`support:${id}:${id}`, `live:${id}`, `chat:${id}:${id}:${id}`, `forum:${id}:created`, `forum:${id}:${id}`, `lesson-question:${id}:${id}`, `lesson-answer:${id}:${id}`] });
    expect(await validate(input)).toHaveLength(0);
  });
  it('accepts all reminder stages and rejects arbitrary reminder ids', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const stage of ['24h','1h','10m','live']) expect(await validate(Object.assign(new ReadNotificationsDto(), { ids: ['live-reminder:' + id + ':1794585600:' + stage] }))).toHaveLength(0);
    expect((await validate(Object.assign(new ReadNotificationsDto(), { ids: ['live-reminder:' + id + ':anything:live'] }))).length).toBeGreaterThan(0);
  });
  it('rejects malformed support event destinations', async () => {
    const input = Object.assign(new ReadNotificationsDto(), { ids: ['support:other-user'] });
    expect((await validate(input)).length).toBeGreaterThan(0);
  });
});
