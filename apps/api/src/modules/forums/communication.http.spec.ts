import {
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommunicationService } from './communication.service.js';
import {
  ForumsController,
  MentorChatController,
} from './communication.controller.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('communication HTTP boundary', () => {
  let app: any;
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const student = '10000000-0000-4000-8000-000000000001',
    mentor = '10000000-0000-4000-8000-000000000002';
  beforeAll(async () => {
    for (const controller of [ForumsController, MentorChatController])
      Reflect.defineMetadata(
        'design:paramtypes',
        [CommunicationService],
        controller,
      );
    // Vite does not emit method parameter metadata; production tsc does.
    const { ForumThreadDto, ChatMessageDto } =
      await import('./communication.dto.js');
    Reflect.defineMetadata(
      'design:paramtypes',
      [Object, ForumThreadDto],
      ForumsController.prototype,
      'create',
    );
    Reflect.defineMetadata(
      'design:paramtypes',
      [Object, String, ChatMessageDto],
      MentorChatController.prototype,
      'send',
    );
    const module = await Test.createTestingModule({
      controllers: [ForumsController, MentorChatController],
      providers: [
        {
          provide: CommunicationService,
          useValue: new CommunicationService({
            client: { schema: () => ({ rpc }) },
          } as any),
        },
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = { id: student, role: req.headers.authorization };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => rpc.mockClear());
  it('requires authentication for public forum URL', async () => {
    await request(app.getHttpServer()).get('/forums/threads').expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['admin', 'soporte'])(
    'denies private contacts for %s including admin guard bypass',
    async (role) => {
      await request(app.getHttpServer())
        .get('/mentor-chat/conversations')
        .set('Authorization', role)
        .expect(403);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it('denies support forum but allows administrative participation', async () => {
    await request(app.getHttpServer())
      .get('/forums/threads')
      .set('Authorization', 'soporte')
      .expect(403);
    await request(app.getHttpServer())
      .get('/forums/threads')
      .set('Authorization', 'admin')
      .expect(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('forum_action', {
      p_actor_id: student,
      p_action: 'list',
      p_input: {},
    });
  });
  it('forwards authenticated forum identity without spoofed fields', async () => {
    await request(app.getHttpServer())
      .post('/forums/threads')
      .set('Authorization', 'estudiante')
      .send({
        title: ' Title ',
        content: ' Body ',
        category: 'Finanzas',
        author_id: mentor,
        identityRole: 'admin',
      })
      .expect(201);
    expect(rpc).toHaveBeenCalledWith('forum_action', {
      p_actor_id: student,
      p_action: 'create',
      p_input: { title: 'Title', content: 'Body', category: 'Finanzas' },
    });
  });
  it('rejects invalid expected mentor and passes exact pair expectation on read/send', async () => {
    await request(app.getHttpServer())
      .get(`/mentor-chat/${student}/messages`)
      .set('Authorization', 'estudiante')
      .expect(400);
    await request(app.getHttpServer())
      .post(`/mentor-chat/${student}/messages`)
      .set('Authorization', 'estudiante')
      .send({ body: 'Hi' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/mentor-chat/${student}/messages?mentorId=${mentor}`)
      .set('Authorization', 'estudiante')
      .expect(200);
    expect(rpc).toHaveBeenLastCalledWith('mentor_chat_action', {
      p_actor_id: student,
      p_action: 'messages',
      p_student_id: student,
      p_body: null,
      p_expected_mentor_id: mentor,
    });
    await request(app.getHttpServer())
      .post(`/mentor-chat/${student}/messages`)
      .set('Authorization', 'estudiante')
      .send({
        body: ' Hello ',
        mentorId: mentor,
        sender_id: mentor,
        sender_role: 'admin',
      })
      .expect(201);
    expect(rpc).toHaveBeenLastCalledWith('mentor_chat_action', {
      p_actor_id: student,
      p_action: 'send',
      p_student_id: student,
      p_body: 'Hello',
      p_expected_mentor_id: mentor,
    });
  });
});
