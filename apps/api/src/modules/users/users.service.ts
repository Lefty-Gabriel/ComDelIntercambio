import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser, Role } from '../auth/auth.types.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<AuthenticatedUser[]> {
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, email, full_name, role')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data as ProfileRow[]).map((row) => this.mapProfile(row));
  }

  async updateRole(id: string, role: Role): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, full_name, role')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Profile not found');
    }
    return this.mapProfile(data as ProfileRow);
  }

  private mapProfile(row: ProfileRow): AuthenticatedUser {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
  }
}
