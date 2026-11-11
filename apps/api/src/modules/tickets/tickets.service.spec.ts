import { ValidationPipe } from '@nestjs/common';
import { SendMessageDto } from './dto/send-message.dto.js';
import { TicketsController } from './tickets.controller.js';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
const actor = (role = 'estudiante', id = 'student') =>
  ({ id, role }) as AuthenticatedUser;
function setup(
  ticket = {
    id: 'ticket',
    student_id: 'student',
    assigned_to: 'agent',
    status: 'open',
  },
) {
  const rpc = vi.fn(async () => ({
    data: { id: 'message', body: 'Hello' },
    error: null,
  }));
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    maybeSingle: async () => ({ data: ticket, error: null }),
  };
  const schema = vi.fn(() => ({ from: () => query, rpc }));
  const service = new TicketsService({
    client: { schema },
  } as any);
  return { service, rpc, schema };
}
describe('support ticket conversation access', () => {
  it('only the assigned support agent can label or resolve a case', async () => {
    const { service, rpc } = setup();
    await expect(service.organize(actor(), 'ticket', ['Acceso'])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.organize(actor('soporte', 'other'), 'ticket')).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
    await service.organize(actor('soporte', 'agent'), 'ticket', [' Acceso ', 'Acceso']);
    expect(rpc).toHaveBeenLastCalledWith('organize_ticket', { p_ticket_id: 'ticket', p_actor_id: 'agent', p_resolve: false, p_labels: ['Acceso'] });
    await service.organize(actor('soporte', 'agent'), 'ticket');
    expect(rpc).toHaveBeenLastCalledWith('organize_ticket', { p_ticket_id: 'ticket', p_actor_id: 'agent', p_resolve: true, p_labels: null });
  });
  it('does not allow replies to resolved conversations', async () => {
    const { service, rpc } = setup({ id: 'ticket', student_id: 'student', assigned_to: 'agent', status: 'resolved' });
    await expect(service.send(actor(), 'ticket', 'Late reply')).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('denies deletion by students and other support agents', async () => {
    await expect(setup().service.remove(actor(), 'ticket')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup().service.remove(actor('soporte', 'other'), 'ticket')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([null, 'agent'])('deletes available or own closed tickets (%s)', async (assigned_to) => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      or: vi.fn(() => query),
      delete: vi.fn(() => query),
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({ data: { id: 'ticket', assigned_to, status: 'closed' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'ticket' }, error: null }),
    };
    const service = new TicketsService({ client: { schema: () => ({ from: () => query }) } } as any);
    await service.remove(actor('soporte', 'agent'), 'ticket');
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith('id', 'ticket');
    expect(query.or).toHaveBeenCalledWith('assigned_to.is.null,assigned_to.eq.agent');
  });
  it.each(['estudiante', 'soporte', 'admin'])('enriches actual senders for viewer %s in one profile batch', async role => {
    const messages = [{ id: 'one', sender_id: 'student', body: 'Ayuda' }, { id: 'two', sender_id: 'agent', body: 'Hola' }, { id: 'three', sender_id: 'deleted', body: 'Anterior' }];
    const query: any = { select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: { id: 'ticket', student_id: 'student', assigned_to: 'agent', status: 'open' }, error: null }),
      range: async () => ({ data: messages, error: null }) };
    const profiles: any = { select: () => profiles, in: vi.fn(async () => ({ data: [{ id: 'student', full_name: ' Ana ', role: 'estudiante' }, { id: 'agent', full_name: ' Luis ', role: 'soporte' }], error: null })) };
    const service = new TicketsService({ client: { schema: (name: string) => ({ from: () => name === 'iam' ? profiles : query }) } } as any);
    expect(await service.messages(actor(role, role === 'soporte' ? 'agent' : 'student'), 'ticket')).toEqual([{ ...messages[0], sender_name: 'Ana', sender_role: 'estudiante' }, { ...messages[1], sender_name: 'Luis', sender_role: 'soporte' }, { ...messages[2], sender_name: null, sender_role: null }]);
    expect(profiles.in).toHaveBeenCalledExactlyOnceWith('id', ['student', 'agent', 'deleted']);
  });
  it('batches profile lookups across 500 distinct senders without losing message order', async () => {
    const messages = Array.from({ length: 501 }, (_, index) => ({ id: String(index), sender_id: 'sender-' + index, body: 'Message ' + index }));
    const query: any = { select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: { id: 'ticket', student_id: 'student', assigned_to: 'agent', status: 'open' }, error: null }),
      range: async (from: number, to: number) => ({ data: messages.slice(from, to + 1), error: null }) };
    const profiles: any = { select: () => profiles, in: vi.fn(async (_column: string, ids: string[]) => ({ data: ids.map(id => ({ id, full_name: id, role: id === 'sender-500' ? 'admin' : 'estudiante' })), error: null })) };
    const service = new TicketsService({ client: { schema: (name: string) => ({ from: () => name === 'iam' ? profiles : query }) } } as any);
    const result = await service.messages(actor(), 'ticket');
    expect(result).toHaveLength(501);
    expect(result[0]).toMatchObject({ id: '0', sender_name: 'sender-0', sender_role: 'estudiante' });
    expect(result[500]).toMatchObject({ id: '500', sender_name: 'sender-500', sender_role: 'admin' });
    expect(profiles.in.mock.calls.map(call => call[1].length)).toEqual([500, 1]);
  });
  it('enriches a sent message from its actual profile', async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValueOnce({ data: { id: 'message', sender_id: 'student', body: 'Hello' }, error: null } as any);
    const profiles: any = { select: () => profiles, in: async () => ({ data: [{ id: 'student', full_name: ' Ana ', role: 'estudiante' }], error: null }) };
    const original = (service as any).supabase.client.schema;
    (service as any).supabase.client.schema = (name: string) => name === 'iam' ? { from: () => profiles } : original(name);
    expect(await service.send(actor(), 'ticket', ' Hello ')).toEqual({ id: 'message', sender_id: 'student', body: 'Hello', sender_name: 'Ana', sender_role: 'estudiante' });
    expect(rpc).toHaveBeenCalledWith('send_message', { p_ticket_id: 'ticket', p_actor_id: 'student', p_body: 'Hello' });
  });
  it('denies an unassigned agent before looking up the student name', async () => {
    const { service, schema } = setup();
    await expect(
      service.messages(actor('soporte', 'other'), 'ticket'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(schema).not.toHaveBeenCalledWith('iam');
  });
  it.each(['messages', 'tickets'])(
    'retrieves %s beyond the PostgREST 1000-row cap',
    async (table) => {
      const rows = Array.from({ length: 1001 }, (_, i) => ({
        id: String(i),
        body: 'Reply ' + i,
      }));
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => ({
          data: {
            id: 'ticket',
            student_id: 'student',
            assigned_to: 'agent',
            status: 'open',
          },
          error: null,
        }),
        range: (start: number, end: number) =>
          Promise.resolve({
            data: rows.slice(start, Math.min(end + 1, start + 1000)),
            error: null,
          }),
        // Match PostgREST's capped default when no range is requested.
        // eslint-disable-next-line unicorn/no-thenable
        then: (resolve: any) =>
          resolve({ data: rows.slice(0, 1000), error: null }),
      };
      const service = new TicketsService({
        client: { schema: () => ({ from: () => query }) },
      } as any);
      const result = await (table === 'messages'
        ? service.messages(actor(), 'ticket')
        : service.list(actor()));
      expect(result).toHaveLength(1001);
      expect(result[1000].id).toBe('1000');
    },
  );
  it('scopes student listing to authenticated student identity', async () => {
    const eq = vi.fn(() => query);
    const query: any = {
      select: () => query,
      eq,
      order: () => query,
      range: async () => ({ data: [{ id: 'own-ticket' }], error: null }),
    };
    const service = new TicketsService({
      client: { schema: () => ({ from: () => query }) },
    } as any);
    expect(await service.list(actor())).toEqual([{ id: 'own-ticket' }]);
    expect(eq).toHaveBeenCalledWith('student_id', 'student');
  });
  it('creates ticket and initial message using authenticated identity', async () => {
    const { service, rpc } = setup();
    await service.create(actor(), ' Help ', ' Hello ');
    expect(rpc).toHaveBeenCalledWith('create_ticket', {
      p_actor_id: 'student',
      p_subject: 'Help',
      p_body: 'Hello',
    });
    await expect(
      service.create(actor('soporte', 'agent'), 'Help', 'Hello'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['mentor'])('denies %s ticket access', async (role) => {
    await expect(setup().service.list(actor(role))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('allows administrative supervision and enriches tickets without changing assignment', async () => {
    const ticket = { id: 'ticket', student_id: 'student', assigned_to: 'agent', status: 'in_progress' };
    const query: any = { select: () => query, order: () => query, range: async () => ({ data: [ticket], error: null }) };
    const profiles: any = { select: () => profiles, in: async () => ({ data: [{ id: 'student', full_name: 'Student name' }, { id: 'agent', full_name: 'Agent name' }], error: null }) };
    const service = new TicketsService({ client: { schema: (name: string) => ({ from: () => name === 'iam' ? profiles : query }) } } as any);
    expect(await service.list(actor('admin'))).toEqual([{ ...ticket, student_name: 'Student name', agent_name: 'Agent name' }]);
  });
  it('keeps administrative supervision read only for all ticket mutations', async () => {
    const { service, rpc } = setup();
    const admin = actor('admin');
    for (const action of [() => service.send(admin, 'ticket', 'Hello'), () => service.claim(admin, 'ticket'), () => service.close(admin, 'ticket'), () => service.organize(admin, 'ticket'), () => service.remove(admin, 'ticket'), () => service.create(admin, 'subject', 'message')]) {
      await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('denies another student conversation', async () => {
    await expect(
      setup().service.messages(actor('estudiante', 'other'), 'ticket'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies an unassigned support agent from sending', async () => {
    await expect(
      setup().service.send(actor('soporte', 'other'), 'ticket', 'Hello'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([actor(), actor('soporte', 'agent')])(
    'sends as the authenticated participant',
    async (user) => {
      const { service, rpc } = setup();
      expect(await service.send(user, 'ticket', 'Hello')).toEqual({
        id: 'message',
        body: 'Hello',
        sender_name: null,
        sender_role: null,
      });
      expect(rpc).toHaveBeenCalledWith('send_message', {
        p_ticket_id: 'ticket',
        p_actor_id: user.id,
        p_body: 'Hello',
      });
    },
  );
  it('rejects messages after closure', async () => {
    const { service, rpc } = setup({
      id: 'ticket',
      student_id: 'student',
      assigned_to: 'agent',
      status: 'closed',
    });
    await expect(
      service.send(actor(), 'ticket', 'Hello'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('denies student closure and allows assigned agent closure', async () => {
    const { service, rpc } = setup();
    await expect(service.close(actor(), 'ticket')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.close(actor('soporte', 'agent'), 'ticket');
    expect(rpc).toHaveBeenCalledWith('close_ticket', {
      p_ticket_id: 'ticket',
      p_actor_id: 'agent',
    });
  });
});

describe('ticket author metadata input boundary', () => {
  it('strips spoofed metadata and forwards only body with authenticated identity', async () => {
    const dto = await new ValidationPipe({ whitelist: true, transform: true }).transform({ body: 'Hello', sender_role: 'admin', sender_name: 'Forged', sender_id: 'admin' }, { type: 'body', metatype: SendMessageDto });
    expect(Object.keys(dto)).toEqual(['body']);
    const send = vi.fn(async () => ({ id: 'message', sender_role: 'estudiante' }));
    const controller = new TicketsController({ send } as any);
    expect(await controller.send(actor(), 'ticket', dto)).toEqual({ id: 'message', sender_role: 'estudiante' });
    expect(send).toHaveBeenCalledExactlyOnceWith(actor(), 'ticket', 'Hello');
  });
});
