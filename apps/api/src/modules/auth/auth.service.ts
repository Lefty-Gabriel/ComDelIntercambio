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

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: AuthenticatedUser['role'];
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
      .select('id, email, full_name, role')
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
    };
  }
}
