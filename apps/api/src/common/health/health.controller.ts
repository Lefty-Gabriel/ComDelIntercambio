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
    const [buckets, profiles, courses, videos] = await Promise.all([
      this.supabase.client.storage.listBuckets(),
      this.supabase.client.schema('iam').from('profiles').select('id', { count: 'exact', head: true }),
      this.supabase.client.schema('courses').from('courses').select('id', { count: 'exact', head: true }),
      this.supabase.client.schema('video').from('videos').select('id', { count: 'exact', head: true }),
    ]);

    const error = buckets.error ?? profiles.error ?? courses.error ?? videos.error;
    if (error) {
      return { status: 'error', message: error.message };
    }

    return {
      status: 'ok',
      buckets: buckets.data?.length ?? 0,
      schemas: {
        iam: { profiles: profiles.count ?? 0 },
        courses: { courses: courses.count ?? 0 },
        video: { videos: videos.count ?? 0 },
      },
    };
  }
}
