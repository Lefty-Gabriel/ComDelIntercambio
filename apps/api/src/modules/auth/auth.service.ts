import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { ROLES } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: AuthenticatedUser['role'];
  title: string;
  company: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  bio: string;
  avatar_url: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async register(dto: RegisterDto): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.fullName },
    });

    if (error) throw new BadRequestException(error.message);
    return this.getProfile(data.user.id);
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.supabase.anon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: await this.getProfile(data.user.id),
    };
  }

  async getProfile(id: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, email, full_name, role, title, company, phone, location, linkedin, website, bio, avatar_url')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Profile not found');
    }

    const row = data as ProfileRow;
    if (!ROLES.includes(row.role))
      throw new UnauthorizedException('Invalid profile role');
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
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<AuthenticatedUser> {
    const updates: Record<string, string> = {};
    if (dto.fullName !== undefined) updates.full_name = dto.fullName.trim();
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.company !== undefined) updates.company = dto.company.trim();
    if (dto.phone !== undefined) updates.phone = dto.phone.trim();
    if (dto.location !== undefined) updates.location = dto.location.trim();
    if (dto.linkedin !== undefined) updates.linkedin = dto.linkedin.trim();
    if (dto.website !== undefined) updates.website = dto.website.trim();
    if (dto.bio !== undefined) updates.bio = dto.bio.trim();
    if (dto.avatarUrl !== undefined) updates.avatar_url = dto.avatarUrl.trim();
    if (dto.email !== undefined) {
      const changed = await this.supabase.client.auth.admin.updateUserById(id, { email: dto.email, email_confirm: true });
      if (changed.error) throw new BadRequestException(changed.error.message);
      updates.email = dto.email.trim().toLowerCase();
    }
    updates.updated_at = new Date().toISOString();
    const { error } = await this.supabase.client.schema('iam').from('profiles').update(updates).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return this.getProfile(id);
  }

  async uploadAvatar(id: string, file: { buffer: Buffer; mimetype: string; size: number }): Promise<AuthenticatedUser> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Formato de imagen no permitido');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('La imagen no puede superar 5 MB');
    const extension = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.split('/')[1];
    const path = `${id}/avatar.${extension}`;
    const uploaded = await this.supabase.client.storage.from('profile-avatars').upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
      cacheControl: '3600',
    });
    if (uploaded.error) throw new BadRequestException(uploaded.error.message);
    const { data } = this.supabase.client.storage.from('profile-avatars').getPublicUrl(path);
    return this.updateProfile(id, { avatarUrl: `${data.publicUrl}?v=${Date.now()}` });
  }
}
