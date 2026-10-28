import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CoursesService } from '../courses/courses.service.js';

interface EnrollmentRow {
  can_view_content?: boolean;
  access_type?: string;
  course_id: string;
  student_id: string;
  status: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  company: string;
  avatar_url: string;
}

interface ModuleRow {
  title: string;
  position: number;
  id: string;
  course_id: string;
}

interface LessonRow {
  position: number;
  summary: string;
  content_text: string;
  video_id: string | null;
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

interface QuestionRow {
  id: string;
  lesson_id: string;
  student_id: string;
  question: string;
  status: 'pending' | 'answered';
  mentor_reply: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LiveSessionRow {
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string;
  duration_minutes: number;
}

@Injectable()
export class MentorDashboardService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly coursesService: CoursesService,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    this.assertMentor(user);
    const assignedCourses = await this.coursesService.listForUser(user);
    const courseIds = assignedCourses.map((course) => course.id);
    if (!courseIds.length) {
      return {
        stats: {
          assignedCourses: 0,
          activeStudents: 0,
          averageProgress: 0,
          upcomingLiveClasses: 0,
          activeLiveSessions: 0,
          questionsPending: 0,
          questionsAnswered: 0,
        },
        courses: [],
        students: [],
        questions: [],
        recentActivity: [],
      };
    }

    const [enrollments, modules, sessions] = await Promise.all([
      this.loadEnrollments(courseIds),
      this.loadModules(courseIds),
      this.loadLiveSessions(courseIds),
    ]);
    const activeEnrollments = enrollments.filter(
      (enrollment) => enrollment.status === 'active',
    );
    const studentIds = [
      ...new Set(activeEnrollments.map((item) => item.student_id)),
    ];
    const [students, lessons] = await Promise.all([
      this.loadStudents(studentIds),
      this.loadLessons(modules.map((item) => item.id)),
    ]);
    const [progress, questions] = await Promise.all([
      this.loadProgress(lessons.map((lesson) => lesson.id)),
      this.loadQuestions(lessons.map((lesson) => lesson.id)),
    ]);

    const courseById = new Map(
      assignedCourses.map((course) => [course.id, course]),
    );
    const moduleById = new Map(modules.map((item) => [item.id, item]));
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const studentById = new Map(
      students.map((student) => [student.id, student]),
    );
    const lessonCourseId = new Map(
      lessons.map((lesson) => [
        lesson.id,
        moduleById.get(lesson.module_id)?.course_id ?? '',
      ]),
    );
    const activeEnrollmentKeys = new Set(
      activeEnrollments
        .filter((item) => item.can_view_content !== false)
        .map((item) => `${item.student_id}:${item.course_id}`),
    );
    const validProgress = progress.filter((item) => {
      const courseId = lessonCourseId.get(item.lesson_id);
      return courseId
        ? activeEnrollmentKeys.has(`${item.student_id}:${courseId}`)
        : false;
    });

    const lessonsByCourse = new Map<string, LessonRow[]>();
    for (const lesson of lessons) {
      const courseId = lessonCourseId.get(lesson.id);
      if (!courseId) continue;
      const rows = lessonsByCourse.get(courseId) ?? [];
      rows.push(lesson);
      lessonsByCourse.set(courseId, rows);
    }
    const enrollmentsByCourse = new Map<string, EnrollmentRow[]>();
    for (const enrollment of activeEnrollments) {
      const rows = enrollmentsByCourse.get(enrollment.course_id) ?? [];
      rows.push(enrollment);
      enrollmentsByCourse.set(enrollment.course_id, rows);
    }
    const completedKeys = new Set(
      validProgress
        .filter((item) => item.completed)
        .map((item) => `${item.student_id}:${item.lesson_id}`),
    );

    const courseSummaries = assignedCourses.map((course) => {
      const courseLessons = lessonsByCourse.get(course.id) ?? [];
      const courseEnrollments = enrollmentsByCourse.get(course.id) ?? [];
      const learningEnrollments = courseEnrollments.filter(
        (enrollment) => enrollment.can_view_content !== false,
      );
      const expected = courseLessons.length * learningEnrollments.length;
      let completed = 0;
      for (const enrollment of learningEnrollments) {
        for (const lesson of courseLessons) {
          if (completedKeys.has(`${enrollment.student_id}:${lesson.id}`)) {
            completed += 1;
          }
        }
      }
      return {
        ...course,
        mentorName: user.fullName,
        mentorTitle: user.title || 'Mentor',
        mentorAvatar: user.avatarUrl || '',
        modules: modules
          .filter((module) => module.course_id === course.id)
          .sort((a, b) => a.position - b.position)
          .map((module) => ({
            id: module.id,
            title: module.title,
            lessons: lessons
              .filter((lesson) => lesson.module_id === module.id)
              .sort((a, b) => a.position - b.position)
              .map((lesson) => ({
                id: lesson.id,
                title: lesson.title,
                summary: lesson.summary,
                content: lesson.content_text,
                videoId: lesson.video_id,
              })),
          })),
        totalModulesCount: modules.filter(
          (courseModule) => courseModule.course_id === course.id,
        ).length,
        totalLessonsCount: courseLessons.length,
        activeStudents: courseEnrollments.length,
        learningStudents: learningEnrollments.length,
        averageProgress: expected
          ? Math.round((completed / expected) * 100)
          : 0,
      };
    });

    const studentSummaries = activeEnrollments.flatMap((enrollment) => {
      const student = studentById.get(enrollment.student_id);
      const course = courseById.get(enrollment.course_id);
      if (!student || !course) return [];
      const courseLessons = lessonsByCourse.get(course.id) ?? [];
      const completedLessons = courseLessons.filter((lesson) =>
        completedKeys.has(`${student.id}:${lesson.id}`),
      ).length;
      return [
        {
          id: student.id,
          email: student.email,
          fullName: student.full_name,
          company: student.company,
          avatarUrl: student.avatar_url,
          courseId: course.id,
          courseTitle: course.title,
          enrolledAt: enrollment.created_at,
          completedLessons,
          totalLessons: courseLessons.length,
          progressPercent: courseLessons.length
            ? Math.round((completedLessons / courseLessons.length) * 100)
            : 0,
        },
      ];
    });

    const mappedQuestions = questions
      .filter((question) => {
        const courseId = lessonCourseId.get(question.lesson_id);
        return courseId
          ? activeEnrollmentKeys.has(`${question.student_id}:${courseId}`)
          : false;
      })
      .map((question) => {
        const lesson = lessonById.get(question.lesson_id);
        const courseId = lessonCourseId.get(question.lesson_id) ?? '';
        const course = courseById.get(courseId);
        const student = studentById.get(question.student_id);
        return {
          id: question.id,
          lessonId: question.lesson_id,
          lessonTitle: lesson?.title ?? '',
          courseId,
          courseTitle: course?.title ?? '',
          studentId: question.student_id,
          studentName: student?.full_name || student?.email || 'Estudiante',
          studentCompany: student?.company ?? '',
          studentAvatar: student?.avatar_url ?? '',
          question: question.question,
          status: question.status,
          mentorReply: question.mentor_reply,
          answeredAt: question.answered_at,
          createdAt: question.created_at,
          updatedAt: question.updated_at,
        };
      });

    const completedProgress = validProgress.filter((item) => item.completed);
    const expectedCompletions = courseSummaries.reduce(
      (total, course) =>
        total + course.totalLessonsCount * course.learningStudents,
      0,
    );
    const now = Date.now();
    const upcomingSessions = sessions.filter((session) => {
      if (session.status === 'ended') return false;
      const scheduledAt = new Date(session.scheduled_at).getTime();
      return (
        session.status === 'live' ||
        scheduledAt + session.duration_minutes * 60_000 >= now
      );
    });
    const recentActivity = [...completedProgress]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, 8)
      .flatMap((item) => {
        const student = studentById.get(item.student_id);
        const lesson = lessonById.get(item.lesson_id);
        const courseId = lessonCourseId.get(item.lesson_id) ?? '';
        const course = courseById.get(courseId);
        if (!student || !lesson || !course) return [];
        return [
          {
            id: `${item.student_id}:${item.lesson_id}:${item.updated_at}`,
            studentId: student.id,
            studentName: student.full_name || student.email,
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
        assignedCourses: assignedCourses.length,
        activeStudents: studentIds.length,
        averageProgress: expectedCompletions
          ? Math.round((completedProgress.length / expectedCompletions) * 100)
          : 0,
        upcomingLiveClasses: upcomingSessions.length,
        activeLiveSessions: sessions.filter(
          (session) => session.status === 'live',
        ).length,
        questionsPending: mappedQuestions.filter(
          (question) => question.status === 'pending',
        ).length,
        questionsAnswered: mappedQuestions.filter(
          (question) => question.status === 'answered',
        ).length,
      },
      courses: courseSummaries,
      students: studentSummaries,
      questions: mappedQuestions,
      recentActivity,
    };
  }

  async answerQuestion(
    user: AuthenticatedUser,
    questionId: string,
    reply: string,
  ) {
    this.assertMentor(user);
    const { data: question, error: questionError } = await this.supabase.client
      .schema('courses')
      .from('lesson_questions')
      .select('id, lesson_id')
      .eq('id', questionId)
      .maybeSingle();
    if (questionError) throw new BadRequestException(questionError.message);
    if (!question) throw new NotFoundException('Lesson question not found');

    const courseId = await this.getLessonCourseId(
      (question as { lesson_id: string }).lesson_id,
    );
    const docenteId = await this.coursesService.getCourseDocenteId(courseId);
    if (docenteId !== user.id) {
      throw new ForbiddenException(
        'You cannot answer questions from another course',
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_questions')
      .update({
        status: 'answered',
        mentor_reply: reply.trim(),
        answered_by: user.id,
        answered_at: now,
        updated_at: now,
      })
      .eq('id', questionId)
      .select(
        'id, lesson_id, student_id, question, status, mentor_reply, answered_at, created_at, updated_at',
      )
      .single();
    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not answer lesson question',
      );
    }
    const row = data as QuestionRow;
    return {
      id: row.id,
      lessonId: row.lesson_id,
      studentId: row.student_id,
      question: row.question,
      status: row.status,
      mentorReply: row.mentor_reply,
      answeredAt: row.answered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private assertMentor(user: AuthenticatedUser) {
    if (user.role !== 'mentor') {
      throw new ForbiddenException('Mentor access required');
    }
  }

  private async loadEnrollments(courseIds: string[]): Promise<EnrollmentRow[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('active_enrollments')
      .select(
        'course_id, student_id, status, created_at, can_view_content, access_type',
      )
      .in('course_id', courseIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as EnrollmentRow[];
  }

  private async loadStudents(studentIds: string[]): Promise<ProfileRow[]> {
    if (!studentIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, email, full_name, company, avatar_url')
      .in('id', studentIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ProfileRow[];
  }

  private async loadModules(courseIds: string[]): Promise<ModuleRow[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('course_modules')
      .select('id, course_id, title, position')
      .in('course_id', courseIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ModuleRow[];
  }

  private async loadLessons(moduleIds: string[]): Promise<LessonRow[]> {
    if (!moduleIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lessons')
      .select('id, module_id, title, position, summary, content_text, video_id')
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

  private async loadQuestions(lessonIds: string[]): Promise<QuestionRow[]> {
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_questions')
      .select(
        'id, lesson_id, student_id, question, status, mentor_reply, answered_at, created_at, updated_at',
      )
      .in('lesson_id', lessonIds)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as QuestionRow[];
  }

  private async loadLiveSessions(
    courseIds: string[],
  ): Promise<LiveSessionRow[]> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .select('status, scheduled_at, duration_minutes')
      .in('course_id', courseIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as LiveSessionRow[];
  }

  private async getLessonCourseId(lessonId: string): Promise<string> {
    const { data: lesson, error: lessonError } = await this.supabase.client
      .schema('courses')
      .from('lessons')
      .select('module_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError) throw new BadRequestException(lessonError.message);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const { data: courseModule, error: moduleError } =
      await this.supabase.client
        .schema('courses')
        .from('course_modules')
        .select('course_id')
        .eq('id', (lesson as { module_id: string }).module_id)
        .maybeSingle();
    if (moduleError) throw new BadRequestException(moduleError.message);
    if (!courseModule) throw new NotFoundException('Course module not found');
    return (courseModule as { course_id: string }).course_id;
  }
}
