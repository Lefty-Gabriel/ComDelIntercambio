import { validate } from 'class-validator';
import { ReadNotificationsDto } from './notifications.dto.js';
describe('notification read identifiers', () => {
  it('accepts persisted support events and academic notifications', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const input = Object.assign(new ReadNotificationsDto(), { ids: [`support:${id}:${id}`, `live:${id}`] });
    expect(await validate(input)).toHaveLength(0);
  });
  it('rejects malformed support event destinations', async () => {
    const input = Object.assign(new ReadNotificationsDto(), { ids: ['support:other-user'] });
    expect((await validate(input)).length).toBeGreaterThan(0);
  });
});
