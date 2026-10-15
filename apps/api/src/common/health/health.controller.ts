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
    const { data, error } = await this.supabase.client.storage.listBuckets();

    if (error) {
      return { status: 'error', message: error.message };
    }

    return { status: 'ok', buckets: data?.length ?? 0 };
  }
}
