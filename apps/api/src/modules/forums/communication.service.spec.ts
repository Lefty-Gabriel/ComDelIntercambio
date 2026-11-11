import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { CommunicationService } from './communication.service.js';
import {
  ForumThreadDto,
  ChatMessageDto,
  ForumLikeDto,
} from './communication.dto.js';
const actor = (role: string) => ({ id: 'actor', role }) as any;
describe('authenticated communication boundaries', () => {
  const setup = () => {
    const rpc = vi.fn(async () => ({
      data: [{ id: 'server-id' }],
      error: null,
    }));
    return {
      rpc,
      service: new CommunicationService({
        client: { schema: () => ({ rpc }) },
      } as any),
    };
  };
  it.each(['admin', 'soporte'])(
    'rejects private chat for %s even when RolesGuard permits admin',
    async (role) => {
      const { service, rpc } = setup();
      await expect(
        service.chat(actor(role), 'contacts'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.chat(actor(role), 'send', 'student', { body: 'Hello' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it('denies support forum access before querying data', async () => {
    const { service, rpc } = setup();
    await expect(
      service.forum(actor('soporte'), 'list'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['estudiante', 'mentor', 'admin'])(
    'forwards trusted forum actor for %s and returns canonical database records',
    async (role) => {
      const { service, rpc } = setup();
      expect(
        await service.forum(actor(role), 'create', {
          title: 'Question',
          content: 'Real',
          category: 'Finanzas',
        }),
      ).toEqual([{ id: 'server-id' }]);
      expect(rpc).toHaveBeenCalledWith('forum_action', {
        p_actor_id: 'actor',
        p_action: 'create',
        p_input: { title: 'Question', content: 'Real', category: 'Finanzas' },
      });
    },
  );
  it('passes explicit liked state unchanged on repeated requests', async () => {
    const { service, rpc } = setup();
    await service.forum(actor('mentor'), 'like', { id: 'thread', liked: true });
    await service.forum(actor('mentor'), 'like', { id: 'thread', liked: true });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it.each(['estudiante', 'mentor'])(
    'uses current assignment RPC for private %s messages',
    async (role) => {
      const { service, rpc } = setup();
      await service.chat(actor(role), 'messages', 'student');
      expect(rpc).toHaveBeenCalledWith('mentor_chat_action', {
        p_actor_id: 'actor',
        p_action: 'messages',
        p_student_id: 'student',
        p_body: null,
        p_expected_mentor_id: null,
      });
    },
  );
  it('propagates authorization and assignment failures without fabricated records', async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Not assigned' },
    } as any);
    await expect(
      service.chat(actor('mentor'), 'messages', 'other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('whitelists author fields and validates nonblank content and explicit boolean likes', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = await pipe.transform(
      {
        title: 'Title',
        content: 'Body',
        category: 'Finanzas',
        author_id: 'forged',
        identityRole: 'admin',
      },
      { type: 'body', metatype: ForumThreadDto },
    );
    expect(Object.keys(dto).sort()).toEqual(['category', 'content', 'title']);
    await expect(
      pipe.transform(
        { body: '   ', mentorId: '10000000-0000-4000-8000-000000000002' },
        { type: 'body', metatype: ChatMessageDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { liked: 'true' },
        { type: 'body', metatype: ForumLikeDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

it('forwards selected mentor expectation for atomically rejecting reassigned conversations', async () => {
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const service = new CommunicationService({
    client: { schema: () => ({ rpc }) },
  } as any);
  await service.chat(actor('estudiante'), 'send', 'student', {
    body: 'Hello',
    mentorId: 'selected-mentor',
  });
  expect(rpc).toHaveBeenCalledWith('mentor_chat_action', {
    p_actor_id: 'actor',
    p_action: 'send',
    p_student_id: 'student',
    p_body: 'Hello',
    p_expected_mentor_id: 'selected-mentor',
  });
});
