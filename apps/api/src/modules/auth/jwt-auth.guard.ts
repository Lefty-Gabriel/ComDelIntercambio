import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser, Role } from './auth.types.js';
import { ROLES } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const url = this.config.get<string>('SUPABASE_URL');
      if (!url) throw new Error('Missing SUPABASE_URL');
      this.jwks = createRemoteJWKSet(
        new URL(`${url}/auth/v1/.well-known/jwks.json`),
      );
    }
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length);

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, this.getJwks());
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub;
    if (!userId) throw new UnauthorizedException('Token without subject');

    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Profile not found');
    }

    if (!ROLES.includes(data.role as Role)) {
      throw new UnauthorizedException('Invalid profile role');
    }

    request.user = {
      id: data.id as string,
      email: data.email as string,
      fullName: data.full_name as string,
      role: data.role as Role,
    };
    return true;
  }
}
