import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser, Role } from '../auth/auth.types.js';
import { ROLES } from '../auth/auth.types.js';
import type { CreateUserDto } from './dto/create-user.dto.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  title: string;
  company: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  bio: string;
  avatar_url: string;
  created_at: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(user: AuthenticatedUser): Promise<AuthenticatedUser[]> {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select(
        'id, email, full_name, role, title, company, phone, location, linkedin, website, bio, avatar_url, created_at',
      )
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data as ProfileRow[]).map((row) => this.mapProfile(row));
  }

  async create(dto: CreateUserDto): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.client.auth.admin.createUser({
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.fullName.trim() },
    });
    if (error || !data.user)
      throw new BadRequestException(error?.message ?? 'Could not create user');
    const { data: profile, error: profileError } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .update({
        role: dto.role,
        company: dto.company?.trim() ?? '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.user.id)
      .select(
        'id, email, full_name, role, title, company, phone, location, linkedin, website, bio, avatar_url, created_at',
      )
      .single();
    if (profileError || !profile) {
      const cleanup = await this.supabase.client.auth.admin.deleteUser(
        data.user.id,
      );
      if (cleanup.error)
        throw new BadRequestException(
          'No se pudo completar el perfil. Revisa la cuenta creada antes de reintentar.',
        );
      throw new BadRequestException(
        profileError?.message ?? 'Could not create profile',
      );
    }
    return this.mapProfile(profile as ProfileRow);
  }

  async updateRole(
    id: string,
    role: Role,
    user: AuthenticatedUser,
  ): Promise<AuthenticatedUser> {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
    if (id === user.id && role !== 'admin')
      throw new ForbiddenException(
        'No puedes retirar tu propio acceso administrativo',
      );
    if (!ROLES.includes(role)) throw new BadRequestException('Invalid role');
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(
        'id, email, full_name, role, title, company, phone, location, linkedin, website, bio, avatar_url, created_at',
      )
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
      title: row.title,
      company: row.company,
      phone: row.phone,
      location: row.location,
      linkedin: row.linkedin,
      website: row.website,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
  }
}
