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
      client: {
        auth: { admin: { createUser } },
        schema: () => ({
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
  it('registration never forwards a supplied elevated role to Auth', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'a@b.com',
        password: 'password123',
        fullName: 'Person',
        role: 'admin',
      });
    expect(response.status).toBe(201);
    expect(response.body.role).toBe('estudiante');
    expect(createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: { full_name: 'Person' },
    });
  });
  it('registration creates a student profile without role metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'password123', fullName: 'Person' });
    expect(response.status).toBe(201);
    expect(response.body.role).toBe('estudiante');
    expect(createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: { full_name: 'Person' },
    });
  });
});
