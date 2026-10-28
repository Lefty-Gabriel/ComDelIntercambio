import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { UpdateRoleDto } from './users/dto/update-role.dto.js';
import { CoursesService } from './courses/courses.service.js';
import { VideosService } from './video/videos.service.js';
import { LiveSessionsService } from './video/live-sessions.service.js';
import type { AuthenticatedUser } from './auth/auth.types.js';
import { UsersService } from './users/users.service.js';
import { AuthService } from './auth/auth.service.js';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

const user = (role: string): AuthenticatedUser =>
  ({
    id: 'person',
    email: 'a@b.com',
    fullName: 'Person',
    role,
  }) as AuthenticatedUser;
const row = {
  id: 'item',
  course_id: 'course',
  docente_id: 'person',
  title: 'Lesson',
  status: 'ready',
  role: 'estudiante',
  course: { id: 'course', title: 'Course' },
};
function persistence() {
  let activeTable = '';
  const query: any = {
    // Supabase query builders intentionally implement the PromiseLike contract.
    // eslint-disable-next-line unicorn/no-thenable
    then: (resolve: any) => resolve({ data: [row], error: null }),
  };
  for (const key of [
    'select',
    'eq',
    'in',
    'order',
    'insert',
    'update',
    'upsert',
  ])
    query[key] = () => query;
  query.single = async () => ({ data: row, error: null });
  query.maybeSingle = async () => ({
    data: activeTable === 'enrollments' ? null : row,
    error: null,
  });
  return {
    client: {
      schema: () => ({
        from: (table: string) => {
          activeTable = table;
          return query;
        },
      }),
    },
  } as any;
}

describe('four-role authorization', () => {
  it.each(['admin', 'mentor', 'estudiante', 'soporte'])(
    'accepts canonical role %s',
    async (role) => {
      expect(
        await validate(Object.assign(new UpdateRoleDto(), { role })),
      ).toHaveLength(0);
    },
  );
  it.each(['docente', 'alumno', 'owner'])(
    'rejects obsolete or unknown role %s',
    async (role) => {
      expect(
        (await validate(Object.assign(new UpdateRoleDto(), { role })))[0]
          .property,
      ).toBe('role');
    },
  );
  it('denies support course listing even with enrollment', async () => {
    await expect(
      new CoursesService(persistence()).listForUser(user('soporte')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['mentor', 'estudiante', 'soporte'])(
    'denies %s direct user administration',
    async (role) => {
      const service = new UsersService(persistence());
      await expect(service.list(user(role))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.updateRole('target', 'admin', user(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each(['docente', 'alumno', 'owner'])(
    'rejects %s from profile and direct role updates',
    async (role) => {
      const db = {
        client: {
          schema: () => ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  single: async () => ({ data: { ...row, role } }),
                }),
              }),
            }),
          }),
        },
      } as any;
      await expect(
        new AuthService(db).getProfile('person'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        new UsersService(persistence()).updateRole(
          'target',
          role as any,
          user('admin'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('allows admin user listing and course administration', async () => {
    expect(
      (await new UsersService(persistence()).list(user('admin')))[0].id,
    ).toBe('item');
    const courses = new CoursesService(persistence());
    expect((await courses.create({ title: 'Lesson' }, user('admin'))).id).toBe(
      'item',
    );
    expect((await courses.enroll('course', 'student', user('admin'))).id).toBe(
      'item',
    );
    expect((await courses.listEnrollments('course', user('admin')))[0].id).toBe(
      'item',
    );
  });
  it.each(['admin', 'mentor', 'estudiante'])(
    '%s can list academic courses',
    async (role) => {
      expect(
        (await new CoursesService(persistence()).listForUser(user(role)))[0]
          .title,
      ).toBe(role === 'estudiante' ? 'Course' : 'Lesson');
    },
  );
  it.each(['admin', 'mentor', 'estudiante', 'soporte'])(
    '%s list results respect course boundaries',
    async (role) => {
      const courseRows = [
        { id: 'assigned', docente_id: 'person', title: 'Assigned' },
        { id: 'enrolled', docente_id: 'other', title: 'Enrolled' },
        { id: 'unrelated', docente_id: 'other', title: 'Unrelated' },
      ];
      const tables: Record<string, any[]> = {
        'courses.courses': courseRows,
        'courses.active_enrollments': [
          {
            student_id: 'person',
            course_id: 'enrolled',
            status: 'active',
            can_view_content: true,
            can_join_live: true,
            can_view_recordings: true,
            course: courseRows[1],
          },
          {
            student_id: 'other',
            course_id: 'unrelated',
            status: 'active',
            course: courseRows[2],
          },
        ],
        'video.videos': courseRows.map((course) => ({
          id: course.id,
          course_id: course.id,
          status: 'ready',
        })),
        'video.live_sessions': courseRows.map((course) => ({
          id: course.id,
          course_id: course.id,
          status: 'scheduled',
        })),
      };
      const db = {
        client: {
          schema: (schema: string) => ({
            from: (table: string) => {
              let rows = [...tables[`${schema}.${table}`]];
              const query: any = {
                select: () => query,
                eq: (field: string, value: string) => {
                  rows = rows.filter((row) => row[field] === value);
                  return query;
                },
                in: (field: string, values: string[]) => {
                  rows = rows.filter((row) => values.includes(row[field]));
                  return query;
                },
                order: () => query,
                // Match Supabase's awaitable query builder.
                // eslint-disable-next-line unicorn/no-thenable
                then: (resolve: any) => resolve({ data: rows, error: null }),
              };
              return query;
            },
          }),
        },
      } as any;
      const courses = new CoursesService(db);
      const operations = [
        () => courses.listForUser(user(role)),
        () => new VideosService(db, courses, {} as any).list(user(role)),
        () => new LiveSessionsService(db, courses).list(user(role)),
      ];
      for (const operation of operations) {
        if (role === 'soporte')
          await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
        else
          expect((await operation()).map((item) => item.id)).toEqual(
            role === 'admin'
              ? ['assigned', 'enrolled', 'unrelated']
              : [role === 'mentor' ? 'assigned' : 'enrolled'],
          );
      }
    },
  );
  it('denies support every video and live-session action, including scheduling', async () => {
    const courses = {
      isEnrolled: async () => true,
      getCourseDocenteId: async () => 'person',
    } as any;
    const videos = new VideosService(persistence(), courses, {} as any);
    const sessions = new LiveSessionsService(persistence(), courses);
    const actor = user('soporte');
    for (const operation of [
      () => videos.create(actor, { courseId: 'course', title: 'Lesson' }),
      () => videos.complete(actor, 'item', {}),
      () => videos.playback(actor, 'item'),
      () => videos.remove(actor, 'item'),
      () =>
        sessions.create(actor, {
          courseId: 'course',
          title: 'Lesson',
          scheduledAt: '2026-11-01T12:00:00Z',
          durationMinutes: 60,
        }),
      () => sessions.end(actor, 'item'),
    ])
      await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['mentor', 'estudiante', 'soporte'])(
    'denies %s direct course administration',
    async (role) => {
      const service = new CoursesService(persistence());
      await expect(
        service.create({ title: 'Lesson' }, user(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      if (role !== 'mentor')
        await expect(
          service.enroll('course', 'target', user(role)),
        ).rejects.toBeInstanceOf(ForbiddenException);
      else
        expect((await service.enroll('course', 'target', user(role))).id).toBe(
          'item',
        );
      await expect(
        service.assignDocente('course', 'target', user(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each([true, false])(
    'scopes mentor enrollments to assignment=%s',
    async (assigned) => {
      const service = new CoursesService(persistence());
      service.getCourseDocenteId = async () => (assigned ? 'person' : 'other');
      const result = service.listEnrollments('course', user('mentor'));
      if (assigned) expect(await result).toEqual([row]);
      else await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  describe.each(['videos', 'sessions'])('%s academic access', (kind) => {
    function service(assigned = true, enrolled = true) {
      const courses = {
        getCourseDocenteId: async () => (assigned ? 'person' : 'other'),
        isEnrolled: async () => enrolled,
      } as any;
      return kind === 'videos'
        ? new VideosService(persistence(), courses, {} as any)
        : new LiveSessionsService(persistence(), courses);
    }
    it.each(['soporte', 'owner'])(
      'denies %s even when enrolled',
      async (role) => {
        await expect(
          service().getById(user(role), 'item'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service().list(user(role))).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      },
    );
    it.each([true, false])('mentor assignment=%s', async (assigned) => {
      const result = service(assigned).getById(user('mentor'), 'item');
      if (assigned) expect((await result).id).toBe('item');
      else await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    });
    it.each([true, false])('student enrollment=%s', async (enrolled) => {
      const result = service(true, enrolled).getById(
        user('estudiante'),
        'item',
      );
      if (enrolled) expect((await result).id).toBe('item');
      else await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
