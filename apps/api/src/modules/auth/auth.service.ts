import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { ROLES } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { randomBytes } from 'node:crypto';
import { LoginSecurity, securityKey } from './login-security.js';

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
  created_at: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}
  async recoverPassword(email: string) {
    const frontend = (
      process.env.FRONTEND_URL || 'http://localhost:5174'
    ).replace(/\/$/, '');
    const challenge = randomBytes(32).toString('hex');
    const stored = await this.supabase.client
      .schema('iam')
      .from('password_recovery_challenges')
      .insert({
        key: securityKey('recovery', challenge),
        account_key: securityKey('account', email),
      });
    if (stored.error)
      throw new ServiceUnavailableException(
        'No se pudo preparar la recuperación. Intenta nuevamente.',
      );
    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${frontend}/recuperar-contrasena?challenge=${challenge}`,
      },
    );
    if (error)
      throw new BadRequestException(
        'No se pudo enviar el enlace. Espera unos minutos e intenta nuevamente.',
      );
    return {
      message:
        'Si el correo está registrado, recibirás un enlace para recuperar tu contraseña.',
    };
  }
  async resetPassword(
    accessToken: string,
    password: string,
    challenge?: string,
  ) {
    const { data, error } = await this.supabase.anon.auth.getUser(accessToken);
    if (error || !data.user)
      throw new UnauthorizedException(
        'El enlace no es válido o ha vencido. Solicita uno nuevo.',
      );
    if (!challenge || !data.user.email) {
      throw new UnauthorizedException(
        'Solicita un enlace de recuperación para cambiar la contraseña.',
      );
    }
    const consumed = await this.supabase.client
      .schema('iam')
      .rpc('consume_recovery_challenge', {
        p_key: securityKey('recovery', challenge),
        p_account_key: securityKey('account', data.user.email),
      });
    if (consumed.error || !consumed.data)
      throw new UnauthorizedException(
        'El enlace ya se utilizó o ha vencido. Solicita uno nuevo.',
      );
    const updated = await this.supabase.client.auth.admin.updateUserById(
      data.user.id,
      { password },
    );
    if (updated.error)
      throw new BadRequestException(
        'No se pudo actualizar la contraseña. Usa una contraseña diferente e intenta de nuevo.',
      );
    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  async login(dto: LoginDto) {
    const security = new LoginSecurity(this.supabase);
    const attempt = await security.begin(dto.email);
    let result;
    try {
      result = await this.supabase.anon.auth.signInWithPassword({
        email: dto.email.trim().toLowerCase(),
        password: dto.password,
      });
    } catch {
      await security.finish(attempt, false, false);
      throw new ServiceUnavailableException(
        'No se pudo conectar al servicio de acceso. Intenta nuevamente.',
      );
    }
    const { data, error } = result;
    const invalid =
      error?.code === 'invalid_credentials' ||
      (!error?.code && error?.status === 400);
    const finished = await security.finish(
      attempt,
      !error && Boolean(data.session),
      invalid,
    );

    if (error || !data.session) {
      if (finished.blocked)
        throw new HttpException(
          'Acceso bloqueado temporalmente tras 5 intentos fallidos. Intenta de nuevo en 15 minutos.',
          429,
        );
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
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
      .select(
        'id, email, full_name, role, title, company, phone, location, linkedin, website, bio, avatar_url, created_at',
      )
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
      createdAt: row.created_at,
    };
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<AuthenticatedUser> {
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
      const current = await this.getProfile(id);
      if (dto.email.trim().toLowerCase() !== current.email.toLowerCase())
        throw new BadRequestException(
          'Por seguridad, el cambio de correo requiere verificación. Solicita el cambio al administrador.',
        );
    }
    updates.updated_at = new Date().toISOString();
    const { error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .update(updates)
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return this.getProfile(id);
  }

  async uploadAvatar(
    id: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<AuthenticatedUser> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype))
      throw new BadRequestException('Formato de imagen no permitido');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('La imagen no puede superar 5 MB');
    const extension =
      file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.split('/')[1];
    const path = `${id}/avatar.${extension}`;
    const uploaded = await this.supabase.client.storage
      .from('profile-avatars')
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
        cacheControl: '3600',
      });
    if (uploaded.error) throw new BadRequestException(uploaded.error.message);
    const { data } = this.supabase.client.storage
      .from('profile-avatars')
      .getPublicUrl(path);
    return this.updateProfile(id, {
      avatarUrl: `${data.publicUrl}?v=${Date.now()}`,
    });
  }
}
