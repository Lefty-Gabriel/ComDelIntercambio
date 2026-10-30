import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CoursesService } from '../courses/courses.service.js';

const COURSE_RESOURCES_BUCKET = 'course-resources';
const RESOURCE_URL_TTL_SECONDS = 600;

interface CourseRow {
  category?: string;
  level?: string;
  id: string;
  title: string;
  description: string;
  content_type?: string;
  docente_id: string | null;
  created_at: string;
}

interface EnrollmentRow {
  access_type?: string;
  expires_at?: string | null;
  can_view_content?: boolean;
  can_join_live?: boolean;
  course: CourseRow | CourseRow[] | null;
}

interface ModuleRow {
  id: string;
  course_id: string;
  title: string;
  position: number;
}

interface LessonRow {
  id: string;
  module_id: string;
  video_id: string | null;
  title: string;
  summary: string;
  content_text: string;
  duration_minutes: number;
  position: number;
}

interface ResourceRow {
  id: string;
  lesson_id: string;
  title: string;
  description: string;
  kind: 'download' | 'complementary';
  resource_type:
    | 'document'
    | 'spreadsheet'
    | 'presentation'
    | 'image'
    | 'archive'
    | 'link'
    | 'audio'
    | 'other';
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  position: number;
}

interface ProgressRow {
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  updated_at: string;
}

interface NoteRow {
  lesson_id: string;
  content: string;
  updated_at: string;
}

interface StudentQuestionRow {
  id: string;
  lesson_id: string;
  question: string;
  status: 'pending' | 'answered';
  mentor_reply: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  company?: string;
  bio?: string;
  linkedin?: string;
  website?: string;
  id: string;
  full_name: string;
  title: string;
  avatar_url: string;
}

interface LiveSessionRow {
  id: string;
  course_id: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string;
  duration_minutes: number;
}

interface AnnouncementRow {
  id: string;
  course_id: string | null;
  title: string;
  body: string;
  published_at: string;
  expires_at: string | null;
}

@Injectable()
export class StudentDashboardService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly courses: CoursesService,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    this.assertStudent(user);

    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('active_enrollments')
      .select(
        'access_type, expires_at, can_view_content, can_join_live, course:courses(id, title, description, content_type, category, level, docente_id, created_at)',
      )
      .eq('student_id', user.id)
      .eq('status', 'active');

    if (error) throw new BadRequestException(error.message);

    const courseRows = ((data ?? []) as unknown as EnrollmentRow[])
      .map((row) => (Array.isArray(row.course) ? row.course[0] : row.course))
      .filter((course): course is CourseRow => Boolean(course))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const courseIds = courseRows.map((course) => course.id);
    const accessRows = (data || []) as unknown as EnrollmentRow[];
    const accessByCourse = new Map(
      accessRows.map((row) => {
        const course = Array.isArray(row.course) ? row.course[0] : row.course;
        return [course?.id, row];
      }),
    );
    const contentCourseIds = courseIds.filter(
      (id) => accessByCourse.get(id)?.can_view_content !== false,
    );
    const liveCourseIds = courseIds.filter(
      (id) => accessByCourse.get(id)?.can_join_live !== false,
    );

    const [moduleRows, upcomingClasses, announcements, assignedMentors] =
      await Promise.all([
        this.loadModules(contentCourseIds),
        this.loadUpcomingClasses(liveCourseIds, courseRows),
        this.loadAnnouncements(courseIds, courseRows),
        this.loadAssignedMentor(user.id),
      ]);

    const lessonRows = await this.loadLessons(moduleRows);
    const [progressRows, resourceRows, noteRows, questionRows] =
      await Promise.all([
        this.loadProgress(user.id, lessonRows),
        this.loadResources(lessonRows),
        this.loadNotes(user.id, lessonRows),
        this.loadQuestions(user.id, lessonRows),
      ]);
    const progressByLesson = new Map(
      progressRows.map((progress) => [progress.lesson_id, progress]),
    );
    const noteByLesson = new Map(
      noteRows.map((note) => [note.lesson_id, note]),
    );
    const lessonsByModule = new Map<string, LessonRow[]>();
    const resourcesByLesson = new Map<string, ResourceRow[]>();
    const questionsByLesson = new Map<string, StudentQuestionRow[]>();

    for (const lesson of lessonRows) {
      const lessons = lessonsByModule.get(lesson.module_id) ?? [];
      lessons.push(lesson);
      lessonsByModule.set(lesson.module_id, lessons);
    }
    for (const resource of resourceRows) {
      const resources = resourcesByLesson.get(resource.lesson_id) ?? [];
      resources.push(resource);
      resourcesByLesson.set(resource.lesson_id, resources);
    }
    for (const question of questionRows) {
      const questions = questionsByLesson.get(question.lesson_id) ?? [];
      questions.push(question);
      questionsByLesson.set(question.lesson_id, questions);
    }

    const modulesByCourse = new Map<string, ModuleRow[]>();
    for (const courseModule of moduleRows) {
      const modules = modulesByCourse.get(courseModule.course_id) ?? [];
      modules.push(courseModule);
      modulesByCourse.set(courseModule.course_id, modules);
    }

    const courses = courseRows.map((course) => {
      const mentor = assignedMentors[0];
      const modules = (modulesByCourse.get(course.id) ?? []).map(
        (courseModule) => ({
          id: courseModule.id,
          title: courseModule.title,
          position: courseModule.position,
          lessons: (lessonsByModule.get(courseModule.id) ?? []).map(
            (lesson) => {
              const progress = progressByLesson.get(lesson.id);
              return {
                id: lesson.id,
                videoId: lesson.video_id,
                title: lesson.title,
                summary: lesson.summary,
                content: lesson.content_text,
                durationMinutes: lesson.duration_minutes,
                position: lesson.position,
                completed: progress?.completed ?? false,
                completedAt: progress?.completed_at ?? null,
                note: noteByLesson.get(lesson.id)?.content ?? '',
                noteUpdatedAt: noteByLesson.get(lesson.id)?.updated_at ?? null,
                questions: (questionsByLesson.get(lesson.id) ?? []).map(
                  (question) => ({
                    id: question.id,
                    lessonId: question.lesson_id,
                    question: question.question,
                    status: question.status,
                    mentorReply: question.mentor_reply,
                    answeredAt: question.answered_at,
                    createdAt: question.created_at,
                    updatedAt: question.updated_at,
                  }),
                ),
                resources: (resourcesByLesson.get(lesson.id) ?? []).map(
                  (resource) => ({
                    id: resource.id,
                    title: resource.title,
                    description: resource.description,
                    kind: resource.kind,
                    resourceType: resource.resource_type,
                    mimeType: resource.mime_type,
                    sizeBytes:
                      resource.size_bytes === null
                        ? null
                        : Number(resource.size_bytes),
                    position: resource.position,
                    sourceType: resource.external_url ? 'external' : 'storage',
                  }),
                ),
              };
            },
          ),
        }),
      );
      const lessons = modules.flatMap((courseModule) => courseModule.lessons);
      const completedLessons = lessons.filter((lesson) => lesson.completed);
      const progressPercent = lessons.length
        ? Math.round((completedLessons.length / lessons.length) * 100)
        : 0;
      const activityDates = lessons
        .map((lesson) => progressByLesson.get(lesson.id)?.updated_at)
        .filter((date): date is string => Boolean(date));

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        contentType: course.content_type || 'course',
        category: course.category || '',
        level: course.level || '',
        accessType: accessByCourse.get(course.id)?.access_type || 'full',
        accessExpiresAt: accessByCourse.get(course.id)?.expires_at || null,
        docenteId: course.docente_id,
        mentorName: mentor?.full_name || 'Mentor por asignar',
        mentorTitle: mentor?.title || 'Tu mentor asignado',
        mentorAvatar: mentor?.avatar_url || '',
        progressPercent,
        completedLessonsCount: completedLessons.length,
        totalLessonsCount: lessons.length,
        totalResourcesCount: lessons.reduce(
          (total, lesson) => total + lesson.resources.length,
          0,
        ),
        estimatedMinutes: lessons.reduce(
          (total, lesson) => total + lesson.durationMinutes,
          0,
        ),
        lastActivityAt: activityDates.sort().at(-1) ?? null,
        nextLessonId:
          lessons.find((lesson) => !lesson.completed)?.id ??
          lessons.at(-1)?.id ??
          null,
        modules,
      };
    });

    const completedLessons = courses.reduce(
      (total, course) => total + course.completedLessonsCount,
      0,
    );
    const totalLessons = courses.reduce(
      (total, course) => total + course.totalLessonsCount,
      0,
    );
    const totalMinutesLearned = lessonRows.reduce((total, lesson) => {
      return progressByLesson.get(lesson.id)?.completed
        ? total + lesson.duration_minutes
        : total;
    }, 0);
    const completedCourses = courses.filter(
      (course) =>
        course.totalLessonsCount > 0 &&
        course.completedLessonsCount === course.totalLessonsCount,
    ).length;

    const learningCourses = courses.filter(
      (course) => course.accessType !== 'live',
    );
    return {
      stats: {
        enrolledCourses: courses.length,
        coursesInProgress: courses.filter(
          (course) =>
            course.totalLessonsCount > 0 && course.progressPercent < 100,
        ).length,
        completedCourses,
        completedLessons,
        totalLessons,
        totalMinutesLearned,
        averageProgress: learningCourses.length
          ? Math.round(
              learningCourses.reduce(
                (total, course) => total + course.progressPercent,
                0,
              ) / learningCourses.length,
            )
          : 0,
        upcomingClasses: upcomingClasses.length,
      },
      courses,
      upcomingClasses,
      mentors: assignedMentors.map((mentor) => ({
        id: mentor.id,
        fullName: mentor.full_name,
        title: mentor.title,
        avatarUrl: mentor.avatar_url,
        company: mentor.company || '',
        bio: mentor.bio || '',
        linkedin: mentor.linkedin || '',
        website: mentor.website || '',
      })),
      announcements,
    };
  }

  async getResume(user: AuthenticatedUser, courseId: string) {
    this.assertStudent(user);
    if (!(await this.courses.isEnrolled(courseId, user.id, 'can_view_content')))
      throw new ForbiddenException('No tienes matricula en este curso');
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('student_resume')
      .select('lesson_id, position_seconds')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data
      ? { lessonId: data.lesson_id, positionSeconds: data.position_seconds }
      : null;
  }
  async saveResume(
    user: AuthenticatedUser,
    courseId: string,
    lessonId: string,
    positionSeconds: number,
  ) {
    this.assertStudent(user);
    await this.assertStudentLessonAccess(user, lessonId);
    if ((await this.getPublishedLessonCourseId(lessonId)) !== courseId)
      throw new ForbiddenException('La leccion no pertenece al curso');
    const { error } = await this.supabase.client
      .schema('courses')
      .from('student_resume')
      .upsert(
        {
          student_id: user.id,
          course_id: courseId,
          lesson_id: lessonId,
          position_seconds: positionSeconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,course_id' },
      );
    if (error) throw new BadRequestException(error.message);
    return { lessonId, positionSeconds };
  }
  async updateLessonProgress(
    user: AuthenticatedUser,
    lessonId: string,
    completed: boolean,
  ) {
    this.assertStudent(user);
    await this.assertStudentLessonAccess(user, lessonId);

    const now = new Date().toISOString();
    const { data: progress, error: progressError } = await this.supabase.client
      .schema('courses')
      .from('lesson_progress')
      .upsert(
        {
          student_id: user.id,
          lesson_id: lessonId,
          completed,
          completed_at: completed ? now : null,
          updated_at: now,
        },
        { onConflict: 'student_id,lesson_id' },
      )
      .select('lesson_id, completed, completed_at, updated_at')
      .single();

    if (progressError || !progress) {
      throw new BadRequestException(
        progressError?.message ?? 'Could not update lesson progress',
      );
    }

    const row = progress as ProgressRow;
    return {
      lessonId: row.lesson_id,
      completed: row.completed,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    };
  }

  async saveLessonNote(
    user: AuthenticatedUser,
    lessonId: string,
    content: string,
  ) {
    this.assertStudent(user);
    await this.assertStudentLessonAccess(user, lessonId);
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('student_lesson_notes')
      .upsert(
        {
          student_id: user.id,
          lesson_id: lessonId,
          content,
          updated_at: now,
        },
        { onConflict: 'student_id,lesson_id' },
      )
      .select('lesson_id, content, updated_at')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not save lesson note',
      );
    }
    const note = data as NoteRow;
    return {
      lessonId: note.lesson_id,
      content: note.content,
      updatedAt: note.updated_at,
    };
  }

  async createLessonQuestion(
    user: AuthenticatedUser,
    lessonId: string,
    question: string,
  ) {
    this.assertStudent(user);
    await this.assertStudentLessonAccess(user, lessonId);
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_questions')
      .insert({
        lesson_id: lessonId,
        student_id: user.id,
        question: question.trim(),
      })
      .select(
        'id, lesson_id, question, status, mentor_reply, answered_at, created_at, updated_at',
      )
      .single();
    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not create lesson question',
      );
    }
    const row = data as StudentQuestionRow;
    return {
      id: row.id,
      lessonId: row.lesson_id,
      question: row.question,
      status: row.status,
      mentorReply: row.mentor_reply,
      answeredAt: row.answered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getResourceAccess(user: AuthenticatedUser, resourceId: string) {
    this.assertStudent(user);

    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_resources')
      .select('id, lesson_id, title, kind, storage_path, external_url')
      .eq('id', resourceId)
      .eq('is_published', true)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Lesson resource not found');

    const resource = data as Pick<
      ResourceRow,
      'id' | 'lesson_id' | 'title' | 'kind' | 'storage_path' | 'external_url'
    >;
    const courseId = await this.getPublishedLessonCourseId(resource.lesson_id);
    const enrolled = await this.courses.isEnrolled(
      courseId,
      user.id,
      'can_view_content',
    );
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    if (resource.external_url) {
      let externalUrl: URL;
      try {
        externalUrl = new URL(resource.external_url);
      } catch {
        throw new BadRequestException('Resource URL is invalid');
      }
      if (!['http:', 'https:'].includes(externalUrl.protocol)) {
        throw new BadRequestException('Resource URL protocol is not allowed');
      }
      return {
        url: externalUrl.toString(),
        expiresIn: null,
        sourceType: 'external',
        fileName: resource.title,
      };
    }

    if (!resource.storage_path) {
      throw new BadRequestException('Resource file is not configured');
    }
    const { data: signed, error: signedError } =
      await this.supabase.client.storage
        .from(COURSE_RESOURCES_BUCKET)
        .createSignedUrl(resource.storage_path, RESOURCE_URL_TTL_SECONDS,
          resource.kind === 'complementary' ? {} : { download: true });

    if (signedError || !signed) {
      throw new BadRequestException(
        signedError?.message ?? 'Could not create resource URL',
      );
    }
    return {
      url: signed.signedUrl,
      expiresIn: RESOURCE_URL_TTL_SECONDS,
      sourceType: 'storage',
      fileName: resource.title,
    };
  }

  private assertStudent(user: AuthenticatedUser) {
    if (user.role !== 'estudiante') {
      throw new ForbiddenException('Student access required');
    }
  }

  private async assertStudentLessonAccess(
    user: AuthenticatedUser,
    lessonId: string,
  ): Promise<string> {
    const courseId = await this.getPublishedLessonCourseId(lessonId);
    const enrolled = await this.courses.isEnrolled(
      courseId,
      user.id,
      'can_view_content',
    );
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
    return courseId;
  }

  private async loadModules(courseIds: string[]): Promise<ModuleRow[]> {
    if (!courseIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('course_modules')
      .select('id, course_id, title, position')
      .in('course_id', courseIds)
      .order('position', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ModuleRow[];
  }

  private async loadLessons(modules: ModuleRow[]): Promise<LessonRow[]> {
    const moduleIds = modules.map((courseModule) => courseModule.id);
    if (!moduleIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lessons')
      .select(
        'id, module_id, video_id, title, summary, content_text, duration_minutes, position',
      )
      .in('module_id', moduleIds)
      .eq('is_published', true)
      .order('position', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as LessonRow[];
  }

  private async loadResources(lessons: LessonRow[]): Promise<ResourceRow[]> {
    const lessonIds = lessons.map((lesson) => lesson.id);
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_resources')
      .select(
        'id, lesson_id, title, description, kind, resource_type, storage_path, external_url, mime_type, size_bytes, position',
      )
      .in('lesson_id', lessonIds)
      .eq('is_published', true)
      .order('position', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ResourceRow[];
  }

  private async getPublishedLessonCourseId(lessonId: string): Promise<string> {
    const { data: lesson, error: lessonError } = await this.supabase.client
      .schema('courses')
      .from('lessons')
      .select('id, module_id')
      .eq('id', lessonId)
      .eq('is_published', true)
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

  private async loadProgress(
    studentId: string,
    lessons: LessonRow[],
  ): Promise<ProgressRow[]> {
    const lessonIds = lessons.map((lesson) => lesson.id);
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_progress')
      .select('lesson_id, completed, completed_at, updated_at')
      .eq('student_id', studentId)
      .in('lesson_id', lessonIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as ProgressRow[];
  }

  private async loadNotes(
    studentId: string,
    lessons: LessonRow[],
  ): Promise<NoteRow[]> {
    const lessonIds = lessons.map((lesson) => lesson.id);
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('student_lesson_notes')
      .select('lesson_id, content, updated_at')
      .eq('student_id', studentId)
      .in('lesson_id', lessonIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as NoteRow[];
  }

  private async loadQuestions(
    studentId: string,
    lessons: LessonRow[],
  ): Promise<StudentQuestionRow[]> {
    const lessonIds = lessons.map((lesson) => lesson.id);
    if (!lessonIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('lesson_questions')
      .select(
        'id, lesson_id, question, status, mentor_reply, answered_at, created_at, updated_at',
      )
      .eq('student_id', studentId)
      .in('lesson_id', lessonIds)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as StudentQuestionRow[];
  }

  private async loadAssignedMentor(studentId: string): Promise<ProfileRow[]> {
    const { data: assignment, error } = await this.supabase.client.schema('iam')
      .from('student_mentors').select('mentor_id').eq('student_id', studentId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!assignment) return [];
    const { data, error: profileError } = await this.supabase.client.schema('iam')
      .from('profiles').select('id, full_name, title, avatar_url, company, bio, linkedin, website')
      .eq('id', assignment.mentor_id).eq('role', 'mentor');
    if (profileError) throw new BadRequestException(profileError.message);
    return (data || []) as ProfileRow[];
  }

  private async loadUpcomingClasses(
    courseIds: string[],
    courseRows: CourseRow[],
  ) {
    if (!courseIds.length) return [];
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .select('id, course_id, title, status, scheduled_at, duration_minutes')
      .in('course_id', courseIds)
      .neq('status', 'ended')
      .order('scheduled_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);

    const now = Date.now();
    const courseTitleById = new Map(
      courseRows.map((course) => [course.id, course.title]),
    );
    return ((data ?? []) as LiveSessionRow[])
      .filter((session) => {
        const scheduledAt = new Date(session.scheduled_at).getTime();
        const endsAt = scheduledAt + session.duration_minutes * 60_000;
        return session.status === 'live' || endsAt >= now;
      })
      .slice(0, 6)
      .map((session) => ({
        id: session.id,
        courseId: session.course_id,
        courseTitle: courseTitleById.get(session.course_id) ?? '',
        title: session.title,
        status: session.status,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
      }));
  }

  private async loadAnnouncements(
    courseIds: string[],
    courseRows: CourseRow[],
  ) {
    const now = new Date();
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('announcements')
      .select('id, course_id, title, body, published_at, expires_at')
      .eq('is_published', true)
      .in('audience', ['all', 'student'])
      .lte('published_at', now.toISOString())
      .order('published_at', { ascending: false })
      .limit(30);
    if (error) throw new BadRequestException(error.message);

    const courseTitleById = new Map(
      courseRows.map((course) => [course.id, course.title]),
    );
    return ((data ?? []) as AnnouncementRow[])
      .filter(
        (announcement) =>
          (!announcement.course_id ||
            courseIds.includes(announcement.course_id)) &&
          (!announcement.expires_at || new Date(announcement.expires_at) > now),
      )
      .slice(0, 6)
      .map((announcement) => ({
        id: announcement.id,
        courseId: announcement.course_id,
        courseTitle: announcement.course_id
          ? (courseTitleById.get(announcement.course_id) ?? '')
          : null,
        title: announcement.title,
        body: announcement.body,
        publishedAt: announcement.published_at,
      }));
  }
}
