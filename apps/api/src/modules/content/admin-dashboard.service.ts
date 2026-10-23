import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: AuthenticatedUser['role'];
  title: string;
  company: string;
  avatar_url: string;
  created_at: string;
}

interface CourseRow {
  id: string;
  title: string;
}

interface EnrollmentRow {
  course_id: string;
  student_id: string;
  status: string;
}

interface ModuleRow {
  id: string;
  course_id: string;
}

interface LessonRow {
  id: string;
  module_id: string;
  title: string;
}

interface ProgressRow {
  student_id: string;
  lesson_id: string;
  completed: boolean;
  updated_at: string;
}

interface LiveSessionRow {
  status: 'scheduled' | 'live' | 'ended';
}

interface VideoRow {
  status: 'pending' | 'ready' | 'error';
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  async getDashboard(user: AuthenticatedUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Administrator access required');
    }

    const [profiles, courses, enrollments, sessions, videos] =
      await Promise.all([
        this.loadProfiles(),
        this.loadCourses(),
        this.loadEnrollments(),
        this.loadLiveSessions(),
        this.loadVideos(),
      ]);
    const modules = await this.loadModules(courses.map((course) => course.id));
    const lessons = await this.loadLessons(modules.map((item) => item.id));
    const progress = await this.loadProgress(
      lessons.map((lesson) => lesson.id),
    );

    const activeEnrollments = enrollments.filter(
      (enrollment) => enrollment.status === 'active',
    );
    const activeStudentIds = new Set(
      activeEnrollments.map((enrollment) => enrollment.student_id),
    );
    const moduleById = new Map(modules.map((item) => [item.id, item]));
    const courseById = new Map(courses.map((course) => [course.id, course]));
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const lessonCourseId = new Map(
      lessons.map((lesson) => [
        lesson.id,
        moduleById.get(lesson.module_id)?.course_id ?? '',
      ]),
    );
    const lessonsPerCourse = new Map<string, number>();
    for (const courseId of lessonCourseId.values()) {
      if (!courseId) continue;
      lessonsPerCourse.set(courseId, (lessonsPerCourse.get(courseId) ?? 0) + 1);
    }

    const activeEnrollmentKeys = new Set(
      activeEnrollments.map(
        (enrollment) => `${enrollment.student_id}:${enrollment.course_id}`,
      ),
    );
    const expectedCompletions = activeEnrollments.reduce(
      (total, enrollment) =>
        total + (lessonsPerCourse.get(enrollment.course_id) ?? 0),
      0,
    );
    const completedProgress = progress.filter((item) => {
      if (!item.completed) return false;
      const courseId = lessonCourseId.get(item.lesson_id);
      return courseId
        ? activeEnrollmentKeys.has(`${item.student_id}:${courseId}`)
        : false;
    });

    const recentActivity = [...completedProgress]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, 8)
      .flatMap((item) => {
        const profile = profileById.get(item.student_id);
        const lesson = lessonById.get(item.lesson_id);
        const courseId = lessonCourseId.get(item.lesson_id);
        const course = courseId ? courseById.get(courseId) : undefined;
        if (!profile || !lesson || !course) return [];
        return [
          {
            id: `${item.student_id}:${item.lesson_id}:${item.updated_at}`,
            type: 'lesson_completed' as const,
            studentId: profile.id,
            studentName: profile.full_name || profile.email,
            courseId: course.id,
            courseTitle: course.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            occurredAt: item.updated_at,
          },
        ];
      });

    return {
      stats: {
        totalUsers: profiles.length,
        totalStudents: profiles.filter(
          (profile) => profile.role === 'estudiante',
        ).length,
        activeStudents: activeStudentIds.size,
        totalMentors: profiles.filter((profile) => profile.role === 'mentor')
          .length,
        totalAdministrators: profiles.filter(
          (profile) => profile.role === 'admin',
        ).length,
        totalCourses: courses.length,
        activeEnrollments: activeEnrollments.length,
        scheduledLiveSessions: sessions.filter(
          (session) => session.status === 'scheduled',
        ).length,
        activeLiveSessions: sessions.filter(
          (session) => session.status === 'live',
        ).length,
        totalVideos: videos.length,
        readyVideos: videos.filter((video) => video.status === 'ready').length,
        averageCompletionRate: expectedCompletions
          ? Math.round((completedProgress.length / expectedCompletions) * 100)
          : 0,
      },
      mentors: profiles
        .filter((profile) => profile.role === 'mentor')
        .map((profile) => ({
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          title: profile.title,
          company: profile.company,
          avatarUrl: profile.avatar_url,
          createdAt: profile.created_at,
        })),
      recentActivity,
    };
  }

  private async loadProfiles(): Promise<ProfileRow[]> {
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select(
        'id, email, full_name, role, title, company, avatar_url, created_at',
      );
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ProfileRow[];
  }

  private async loadCourses(): Promise<CourseRow[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .select('id, title');
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as CourseRow[];
  }

  private async loadEnrollments(): Promise<EnrollmentRow[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .select('course_id, student_id, status');
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as EnrollmentRow[];
  }

  private async loadModules(courseIds: string[]): Promise<ModuleRow[]> {
    if (!courseIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('course_modules')
      .select('id, course_id')
      .in('course_id', courseIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ModuleRow[];
  }

  private async loadLessons(moduleIds: string[]): Promise<LessonRow[]> {
    if (!moduleIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lessons')
      .select('id, module_id, title')
      .in('module_id', moduleIds)
      .eq('is_published', true);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as LessonRow[];
  }

  private async loadProgress(lessonIds: string[]): Promise<ProgressRow[]> {
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_progress')
      .select('student_id, lesson_id, completed, updated_at')
      .in('lesson_id', lessonIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ProgressRow[];
  }

  private async loadLiveSessions(): Promise<LiveSessionRow[]> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .select('status');
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as LiveSessionRow[];
  }

  private async loadVideos(): Promise<VideoRow[]> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .select('status');
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as VideoRow[];
  }
}
