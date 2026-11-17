import { createHash } from 'node:crypto';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';

export const securityKey = (scope: string, value: string) =>
  scope +
  ':' +
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
export class LoginSecurity {
  constructor(private readonly supabase: SupabaseService) {}
  private async call(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .schema('iam')
      .rpc(name, args);
    if (error)
      throw new ServiceUnavailableException(
        'No se pudo verificar la seguridad del acceso. Intenta nuevamente.',
      );
    return data;
  }
  async begin(email: string) {
    const key = securityKey('account', email);
    const result = await this.call('begin_login', { p_key: key });
    if (result.blocked)
      throw new HttpException(
        'Acceso bloqueado temporalmente tras 5 intentos fallidos. Intenta de nuevo en 15 minutos.',
        429,
      );
    if (result.busy)
      throw new HttpException(
        'Ya hay un intento de acceso en curso. Espera unos segundos.',
        429,
      );
    return { key, lease: result.lease, email: email.trim().toLowerCase() };
  }
  finish(
    attempt: { key: string; lease: string; email: string },
    success: boolean,
    countFailure = true,
  ) {
    return this.call('finish_login', {
      p_key: attempt.key,
      p_lease: attempt.lease,
      p_success: success,
      p_count_failure: countFailure,
      p_email: attempt.email,
    });
  }
}
