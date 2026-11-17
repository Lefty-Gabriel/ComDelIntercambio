import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private clientInstance?: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  get client(): SupabaseClient {
    if (!this.clientInstance) {
      const url = this.config.get<string>('SUPABASE_URL');
      const serviceRoleKey = this.config.get<string>(
        'SUPABASE_SERVICE_ROLE_KEY',
      );

      if (!url || !serviceRoleKey) {
        throw new Error(
          'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env (see .env.example).',
        );
      }

      this.clientInstance = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    return this.clientInstance;
  }

  get anon(): SupabaseClient {
    const url = this.config.get<string>('SUPABASE_URL');
    const anonKey = this.config.get<string>('SUPABASE_ANON_KEY');

    if (!url || !anonKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check your .env (see .env.example).',
      );
    }

    // Each password operation has an isolated auth session.
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}
