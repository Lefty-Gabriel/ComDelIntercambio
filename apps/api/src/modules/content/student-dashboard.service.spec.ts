import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StudentDashboardService } from './student-dashboard.service.js';

const student: AuthenticatedUser = {
  id: 'student-1',
  email: 'student@example.com',
  fullName: 'Student One',
  role: 'estudiante',
};

function progressPersistence() {
  let savedProgress: Record<string, unknown> | undefined;

  const database = {
    client: {
      schema: () => ({
        from: (table: string) => {
          const query: any = {
            select: () => query,
            eq: () => query,
            upsert: (input: Record<string, unknown>) => {
              savedProgress = input;
              return query;
            },
            maybeSingle: async () => ({
              data:
                table === 'lessons'
                  ? { id: 'lesson-1', module_id: 'module-1' }
                  : { course_id: 'course-1' },
              error: null,
            }),
            single: async () => ({
              data: {
                lesson_id: savedProgress?.lesson_id,
                completed: savedProgress?.completed,
                completed_at: savedProgress?.completed_at,
                updated_at: savedProgress?.updated_at,
              },
              error: null,
            }),
          };
          return query;
        },
      }),
    },
  } as any;

  return {
    database,
    getSavedProgress: () => savedProgress,
  };
}

function resourcePersistence(
  source: { storagePath?: string; externalUrl?: string } = {
    storagePath: 'course-1/guide.pdf',
  },
) {
  let requestedBucket = '';
  const database = {
    client: {
      schema: () => ({
        from: (table: string) => {
          const query: any = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data:
                table === 'lesson_resources'
                  ? {
                      id: 'resource-1',
                      lesson_id: 'lesson-1',
                      title: 'Guide',
                      storage_path: source.storagePath ?? null,
                      external_url: source.externalUrl ?? null,
                    }
                  : table === 'lessons'
                    ? { id: 'lesson-1', module_id: 'module-1' }
                    : { course_id: 'course-1' },
              error: null,
            }),
          };
          return query;
        },
      }),
      storage: {
        from: (bucket: string) => {
          requestedBucket = bucket;
          return {
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://storage.example.com/guide.pdf' },
              error: null,
            }),
          };
        },
      },
    },
  } as any;
  return { database, getRequestedBucket: () => requestedBucket };
}

describe('StudentDashboardService', () => {
  it('rejects dashboard access for non-student roles', async () => {
    const service = new StudentDashboardService({} as any, {} as any);
    await expect(
      service.getDashboard({ ...student, role: 'mentor' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects progress updates outside enrolled courses', async () => {
    const { database } = progressPersistence();
    const service = new StudentDashboardService(database, {
      isEnrolled: async () => false,
    } as any);

    await expect(
      service.updateLessonProgress(student, 'lesson-1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('persists progress for an enrolled student', async () => {
    const { database, getSavedProgress } = progressPersistence();
    const service = new StudentDashboardService(database, {
      isEnrolled: async () => true,
    } as any);

    const result = await service.updateLessonProgress(
      student,
      'lesson-1',
      true,
    );

    expect(getSavedProgress()).toMatchObject({
      student_id: student.id,
      lesson_id: 'lesson-1',
      completed: true,
    });
    expect(result).toMatchObject({ lessonId: 'lesson-1', completed: true });
  });

  it('rejects resource access outside enrolled courses', async () => {
    const { database } = resourcePersistence();
    const service = new StudentDashboardService(database, {
      isEnrolled: async () => false,
    } as any);

    await expect(
      service.getResourceAccess(student, 'resource-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a temporary URL for a private course resource', async () => {
    const { database, getRequestedBucket } = resourcePersistence();
    const service = new StudentDashboardService(database, {
      isEnrolled: async () => true,
    } as any);

    const result = await service.getResourceAccess(student, 'resource-1');

    expect(getRequestedBucket()).toBe('course-resources');
    expect(result).toMatchObject({
      url: 'https://storage.example.com/guide.pdf',
      sourceType: 'storage',
      expiresIn: 600,
    });
  });

  it('rejects unsafe external resource protocols', async () => {
    const { database } = resourcePersistence({
      externalUrl: 'javascript:alert(1)',
    });
    const service = new StudentDashboardService(database, {
      isEnrolled: async () => true,
    } as any);

    await expect(
      service.getResourceAccess(student, 'resource-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a private lesson note for an enrolled student', async () => {
    let saved: Record<string, unknown> | undefined;
    const query: any = {
      upsert: (input: Record<string, unknown>) => {
        saved = input;
        return query;
      },
      select: () => query,
      single: async () => ({
        data: {
          lesson_id: saved?.lesson_id,
          content: saved?.content,
          updated_at: saved?.updated_at,
        },
        error: null,
      }),
    };
    const service = new StudentDashboardService(
      { client: { schema: () => ({ from: () => query }) } } as any,
      {} as any,
    ) as any;
    service.assertStudentLessonAccess = async () => 'course-1';

    const result = await service.saveLessonNote(
      student,
      'lesson-1',
      'My private note',
    );

    expect(saved).toMatchObject({
      student_id: student.id,
      lesson_id: 'lesson-1',
      content: 'My private note',
    });
    expect(result).toMatchObject({
      lessonId: 'lesson-1',
      content: 'My private note',
    });
  });

  it('persists a lesson question for an enrolled student', async () => {
    let saved: Record<string, unknown> | undefined;
    const query: any = {
      insert: (input: Record<string, unknown>) => {
        saved = input;
        return query;
      },
      select: () => query,
      single: async () => ({
        data: {
          id: 'question-1',
          lesson_id: saved?.lesson_id,
          question: saved?.question,
          status: 'pending',
          mentor_reply: null,
          answered_at: null,
          created_at: '2026-10-23T12:00:00.000Z',
          updated_at: '2026-10-23T12:00:00.000Z',
        },
        error: null,
      }),
    };
    const service = new StudentDashboardService(
      { client: { schema: () => ({ from: () => query }) } } as any,
      {} as any,
    ) as any;
    service.assertStudentLessonAccess = async () => 'course-1';

    const result = await service.createLessonQuestion(
      student,
      'lesson-1',
      ' How does this work? ',
    );

    expect(saved).toMatchObject({
      student_id: student.id,
      lesson_id: 'lesson-1',
      question: 'How does this work?',
    });
    expect(result).toMatchObject({
      id: 'question-1',
      status: 'pending',
    });
  });
});
