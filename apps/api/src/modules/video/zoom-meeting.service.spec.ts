import { ZoomMeetingService } from './zoom-meeting.service.js';
import { createHmac } from 'node:crypto';
const actor: any = { id: 'student', role: 'estudiante', fullName: 'Ana', email: 'ana@example.com' };
const session = { id: 'lesson', status: 'scheduled', scheduledAt: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60, meetingId: '883 7177 0079', meetingPasscode: 'guest', joinUrl: 'https://zoom.us/j/88371770079?pwd=encoded' };
function make(row = session, credentials = true) {
  const sessions = { getById: vi.fn().mockResolvedValue(row) };
  const config = { get: vi.fn(key => credentials ? key.endsWith('SECRET') ? 'server-secret' : 'client-id' : '') };
  return { sessions, config, service: new ZoomMeetingService(sessions as any, config as any) };
}
describe('embedded Zoom authorization', () => {
  it('checks canonical enrollment permission before configuration or signing', async () => {
    const { service, sessions, config } = make();
    sessions.getById.mockRejectedValue(new Error('Not enrolled'));
    await expect(service.join(actor, 'lesson')).rejects.toThrow('Not enrolled');
    expect(config.get).not.toHaveBeenCalled();
  });
  it('signs a server-controlled participant token for the stored meeting', async () => {
    const { service, sessions } = make();
    const result = await service.join(actor, 'lesson');
    expect(sessions.getById).toHaveBeenCalledWith(actor, 'lesson');
    const [head, body, signature] = result.signature.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(payload).toMatchObject({ appKey: 'client-id', mn: '88371770079', role: 0 });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(signature).toBe(createHmac('sha256', 'server-secret').update(head + '.' + body).digest('base64url'));
    expect(result.password).toBe('guest');
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });
  it('explains missing credentials without fabricating a working connection', async () => {
    await expect(make(session, false).service.join(actor, 'lesson')).rejects.toThrow('Administracion debe conectar');
  });
  it('does not join a finished class', async () => {
    await expect(make({ ...session, status: 'ended' }).service.join(actor, 'lesson')).rejects.toThrow('finalizo');
  });
  it('does not treat an encrypted invitation parameter as the meeting password', async () => {
    await expect(make({ ...session, meetingPasscode: '' }).service.join(actor, 'lesson')).rejects.toThrow('codigo de acceso');
  });
  it('can extract the meeting ID from a valid stored Zoom link', async () => {
    const result = await make({ ...session, meetingId: '' }).service.join(actor, 'lesson');
    expect(result.meetingNumber).toBe('88371770079');
  });
  it('rejects a link on an impersonating domain', async () => {
    await expect(make({ ...session, meetingId: '', joinUrl: 'https://zoom.us.evil.com/j/88371770079' }).service.join(actor, 'lesson')).rejects.toThrow('ID');
  });
});
