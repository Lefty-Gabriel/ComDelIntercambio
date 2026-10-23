import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  fullName: 'Admin One',
  role: 'admin',
};

describe('AdminDashboardService', () => {
  it('rejects non-administrator roles', async () => {
    const service = new AdminDashboardService({} as any);
    await expect(
      service.getDashboard({ ...admin, role: 'mentor' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('calculates metrics from persisted academic data', async () => {
    const service = new AdminDashboardService({} as any) as any;
    service.loadProfiles = async () => [
      {
        id: 'student-1',
        email: 'student@example.com',
        full_name: 'Student One',
        role: 'estudiante',
        title: '',
        company: 'Acme',
        avatar_url: '',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'mentor-1',
        email: 'mentor@example.com',
        full_name: 'Mentor One',
        role: 'mentor',
        title: 'Mentor',
        company: 'Acme',
        avatar_url: '',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'admin-1',
        email: 'admin@example.com',
        full_name: 'Admin One',
        role: 'admin',
        title: '',
        company: '',
        avatar_url: '',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    service.loadCourses = async () => [{ id: 'course-1', title: 'Course' }];
    service.loadEnrollments = async () => [
      { course_id: 'course-1', student_id: 'student-1', status: 'active' },
    ];
    service.loadModules = async () => [
      { id: 'module-1', course_id: 'course-1' },
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
    service.loadLiveSessions = async () => [
      { status: 'scheduled' },
      { status: 'live' },
    ];
    service.loadVideos = async () => [
      { status: 'ready' },
      { status: 'pending' },
    ];

    const dashboard = await service.getDashboard(admin);

    expect(dashboard.stats).toMatchObject({
      totalUsers: 3,
      totalStudents: 1,
      activeStudents: 1,
      totalMentors: 1,
      totalCourses: 1,
      scheduledLiveSessions: 1,
      activeLiveSessions: 1,
      averageCompletionRate: 50,
      readyVideos: 1,
    });
    expect(dashboard.recentActivity[0]).toMatchObject({
      studentName: 'Student One',
      courseTitle: 'Course',
      lessonTitle: 'Lesson 1',
    });
  });
});
