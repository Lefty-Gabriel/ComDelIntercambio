import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('db')
  async db() {
    const [
      buckets,
      profiles,
      courses,
      modules,
      lessons,
      resources,
      progress,
      notes,
      questions,
      announcements,
      videos,
    ] = await Promise.all([
      this.supabase.client.storage.listBuckets(),
      this.supabase.client
        .schema('iam')
        .from('profiles')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('courses')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('course_modules')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('lessons')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('lesson_resources')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('lesson_progress')
        .select('lesson_id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('student_lesson_notes')
        .select('lesson_id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('lesson_questions')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('courses')
        .from('announcements')
        .select('id', { count: 'exact', head: true }),
      this.supabase.client
        .schema('video')
        .from('videos')
        .select('id', { count: 'exact', head: true }),
    ]);

    const error =
      buckets.error ??
      profiles.error ??
      courses.error ??
      modules.error ??
      lessons.error ??
      resources.error ??
      progress.error ??
      notes.error ??
      questions.error ??
      announcements.error ??
      videos.error;
    if (error) {
      return { status: 'error', message: error.message };
    }

    return {
      status: 'ok',
      buckets: buckets.data?.length ?? 0,
      schemas: {
        iam: { profiles: profiles.count ?? 0 },
        courses: {
          courses: courses.count ?? 0,
          modules: modules.count ?? 0,
          lessons: lessons.count ?? 0,
          resources: resources.count ?? 0,
          progress: progress.count ?? 0,
          notes: notes.count ?? 0,
          questions: questions.count ?? 0,
          announcements: announcements.count ?? 0,
        },
        video: { videos: videos.count ?? 0 },
      },
    };
  }
}
