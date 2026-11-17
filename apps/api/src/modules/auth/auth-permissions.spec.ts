import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { UsersController } from '../users/users.controller.js';
import { UsersService } from '../users/users.service.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => ({ payload: { sub: token } }),
}));

describe('HTTP authentication and role assignment', () => {
  let app: any;
  const profile = (role: string) => ({
    id: role,
    role,
    email: 'user@example.com',
    full_name: 'User',
  });
  const createUser = vi.fn(async () => ({
    data: { user: { id: 'estudiante' } },
    error: null,
  }));
  beforeAll(async () => {
    const db = {
      anon: { auth: { signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const role = email.split('@')[0];
        return password === 'correct-password' && ['admin','mentor','estudiante','soporte'].includes(role)
          ? { data: { user: { id: role }, session: { access_token: role, refresh_token: 'refresh', expires_at: 9999999999 } }, error: null }
          : { data: { session: null }, error: { message: 'Invalid credentials' } };
      } } },
      client: {
        auth: { admin: { createUser } },
        schema: () => ({
          rpc: async (name: string) => ({ data: name === 'begin_login' ? { lease: 'test-lease' } : { blocked: false }, error: null }),
          from: () => {
            let id = 'estudiante';
            let role: string | undefined;
            const query: any = {
              select: () => query,
              eq: (_: string, value: string) => {
                id = value;
                return query;
              },
              update: (value: { role: string }) => {
                role = value.role;
                return query;
              },
              single: async () => ({ data: profile(role ?? id), error: null }),
              order: async () => ({
                data: [profile('estudiante')],
                error: null,
              }),
            };
            return query;
          },
        }),
      },
    };
    // Vite's TS transform does not emit constructor metadata.
    Reflect.defineMetadata('design:paramtypes', [AuthService], AuthController);
    Reflect.defineMetadata(
      'design:paramtypes',
      [UsersService],
      UsersController,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController, UsersController],
      providers: [
        { provide: AuthService, useValue: new AuthService(db as any) },
        { provide: UsersService, useValue: new UsersService(db as any) },
        { provide: SupabaseService, useValue: db },
        { provide: ConfigService, useValue: { get: () => 'http://localhost' } },
        {
          provide: JwtAuthGuard,
          useValue: new JwtAuthGuard(
            { get: () => 'http://localhost' } as any,
            db as any,
          ),
        },
        RolesGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => createUser.mockClear());
  it.each(['admin','mentor','estudiante','soporte'])('login returns the persisted identity and role for %s', async role => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email: `${role}@example.com`, password: 'correct-password' });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe(role);
    expect(response.body.accessToken).toBe(role);
  });
  it('rejects wrong passwords and unauthenticated protected requests', async () => {
    expect((await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@example.com', password: 'wrong' })).status).toBe(401);
    for (const path of ['/auth/me','/users']) expect((await request(app.getHttpServer()).get(path)).status).toBe(401);
  });
  it.each(['admin','mentor','estudiante','soporte'])('admin registers a working profile with role %s', async role => {
    const response = await request(app.getHttpServer()).post('/users').set('Authorization','Bearer admin').send({ email: `${role}@example.com`, fullName: 'Registered Person', password: 'password123', role });
    expect(response.status).toBe(201);
    expect(response.body.role).toBe(role);
    expect(createUser).toHaveBeenCalledOnce();
  });
  it.each(['mentor','estudiante','soporte'])('%s cannot register privileged accounts', async role => {
    const response = await request(app.getHttpServer()).post('/users').set('Authorization',`Bearer ${role}`).send({email:'new@example.com',fullName:'New Person',password:'password123',role:'admin'});
    expect(response.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });
  it.each(['admin', 'mentor', 'estudiante', 'soporte'])(
    '%s can read own authenticated profile',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${role}`);
      expect(response.status).toBe(200);
      expect(response.body.role).toBe(role);
    },
  );
  it.each(['docente', 'alumno', 'owner'])(
    'JWT guard rejects runtime role %s',
    async (role) => {
      expect(
        (
          await request(app.getHttpServer())
            .get('/auth/me')
            .set('Authorization', `Bearer ${role}`)
        ).status,
      ).toBe(401);
    },
  );
  it.each(['mentor', 'estudiante', 'soporte'])(
    '%s cannot assign roles or list users',
    async (role) => {
      expect(
        (
          await request(app.getHttpServer())
            .patch('/users/target/role')
            .set('Authorization', `Bearer ${role}`)
            .send({ role: 'admin' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .get('/users')
            .set('Authorization', `Bearer ${role}`)
        ).status,
      ).toBe(403);
    },
  );
  it.each(['admin', 'mentor', 'estudiante', 'soporte'])(
    'admin can assign %s',
    async (role) => {
      const response = await request(app.getHttpServer())
        .patch('/users/target/role')
        .set('Authorization', 'Bearer admin')
        .send({ role });
      expect(response.status).toBe(200);
      expect(response.body.role).toBe(role);
    },
  );
  it.each([{}, {role:'admin'}])('does not expose public registration: %j', async extra => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({email:'a@b.com',password:'password123',fullName:'Person',...extra});
    expect(response.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });
});
