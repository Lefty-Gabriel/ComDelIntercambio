import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MentorDashboardService } from './mentor-dashboard.service.js';

const mentor: AuthenticatedUser = {
  id: 'mentor-1',
  email: 'mentor@example.com',
  fullName: 'Mentor One',
  role: 'mentor',
};

describe('MentorDashboardService', () => {
  it('rejects non-mentor roles', async () => {
    const service = new MentorDashboardService({} as any, {} as any);
    await expect(
      service.getDashboard({ ...mentor, role: 'estudiante' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('calculates assigned-course and student progress metrics', async () => {
    const courses = {
      listForUser: async () => [
        {
          id: 'course-1',
          title: 'Course',
          description: '',
          createdBy: 'admin-1',
          docenteId: mentor.id,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const service = new MentorDashboardService(
      {} as any,
      courses as any,
    ) as any;
    service.loadEnrollments = async () => [
      {
        course_id: 'course-1',
        student_id: 'student-1',
        status: 'active',
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ];
    service.loadModules = async () => [
      { id: 'module-1', course_id: 'course-1' },
    ];
    service.loadLiveSessions = async () => [
      {
        status: 'scheduled',
        scheduled_at: '2099-01-01T12:00:00.000Z',
        duration_minutes: 60,
      },
    ];
    service.loadStudents = async () => [
      {
        id: 'student-1',
        email: 'student@example.com',
        full_name: 'Student One',
        company: 'Acme',
        avatar_url: '',
      },
    ];
    service.loadLessons = async () => [
      { id: 'lesson-1', module_id: 'module-1', title: 'Lesson 1' },
      { id: 'lesson-2', module_id: 'module-1', title: 'Lesson 2' },
    ];
    service.loadProgress = async () => [
      {
        student_id: 'student-1',
        lesson_id: 'lesson-1',
        completed: true,
        updated_at: '2026-10-23T12:00:00.000Z',
      },
    ];
    service.loadQuestions = async () => [
      {
        id: 'question-1',
        lesson_id: 'lesson-1',
        student_id: 'student-1',
        question: 'How does this work?',
        status: 'pending',
        mentor_reply: null,
        answered_at: null,
        created_at: '2026-10-23T11:00:00.000Z',
        updated_at: '2026-10-23T11:00:00.000Z',
      },
    ];

    const dashboard = await service.getDashboard(mentor);

    expect(dashboard.stats).toMatchObject({
      assignedCourses: 1,
      activeStudents: 1,
      averageProgress: 50,
      upcomingLiveClasses: 1,
      questionsPending: 1,
    });
    expect(dashboard.courses[0]).toMatchObject({
      id: 'course-1',
      totalModulesCount: 1,
      totalLessonsCount: 2,
      activeStudents: 1,
      averageProgress: 50,
    });
    expect(dashboard.students[0]).toMatchObject({
      fullName: 'Student One',
      progressPercent: 50,
    });
  });
});
