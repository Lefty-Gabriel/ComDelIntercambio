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
  it.each([
    { role: 'soporte', fullName: ' Ana López ', expectedName: 'Ana López' },
    { role: 'soporte', fullName: null, expectedName: null },
    { role: 'estudiante', fullName: 'Ana López', expectedName: undefined },
  ])(
    'includes the student profile name only for assigned support ($role, $fullName)',
    async ({ role, fullName, expectedName }) => {
      const messages = [
        { id: 'one', sender_id: 'student', body: 'Necesito ayuda' },
        { id: 'two', sender_id: 'agent', body: 'Te ayudo' },
      ];
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => ({
          data: {
            id: 'ticket',
            student_id: 'student',
            assigned_to: 'agent',
            status: 'in_progress',
          },
          error: null,
        }),
        range: async () => ({ data: messages, error: null }),
      };
      const profile: any = {
        select: vi.fn(() => profile),
        eq: vi.fn(() => profile),
        maybeSingle: async () => ({
          data: fullName === null ? null : { full_name: fullName },
          error: null,
        }),
      };
      const schema = vi.fn((name) => ({
        from: () => (name === 'iam' ? profile : query),
      }));
      const service = new TicketsService({ client: { schema } } as any);
      const result = await service.messages(
        actor(role, role === 'soporte' ? 'agent' : 'student'),
        'ticket',
      );
      expect(result[0]).toEqual(
        role === 'soporte'
          ? { ...messages[0], sender_name: expectedName }
          : messages[0],
      );
      expect(result[1]).toEqual(messages[1]);
      if (role === 'soporte') {
        expect(profile.select).toHaveBeenCalledWith('full_name');
        expect(profile.eq).toHaveBeenCalledWith('id', 'student');
      } else {
        expect(schema).not.toHaveBeenCalledWith('iam');
      }
    },
  );
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
  it.each(['admin', 'mentor'])('denies %s ticket access', async (role) => {
    await expect(setup().service.list(actor(role))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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
