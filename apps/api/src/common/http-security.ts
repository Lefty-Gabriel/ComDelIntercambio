import type { INestApplication } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service.js';
import { securityKey } from '../modules/auth/login-security.js';

export function httpSecuritySettings(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === 'production';
  const origins = (
    env.CORS_ORIGINS ||
    env.FRONTEND_URL ||
    (production ? '' : 'http://localhost:5174,http://127.0.0.1:5174')
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes('*'))
    throw new Error('Configure explicit CORS_ORIGINS');
  for (const origin of origins) {
    const url = new URL(origin);
    if (origin !== url.origin || (production && url.protocol !== 'https:'))
      throw new Error(
        'Production origins require HTTPS and must not include a path',
      );
  }
  if (
    production &&
    (!env.PUBLIC_API_URL || new URL(env.PUBLIC_API_URL).protocol !== 'https:')
  )
    throw new Error('Configure PUBLIC_API_URL with HTTPS in production');
  return {
    production,
    origins,
    apiOrigin: env.PUBLIC_API_URL ? new URL(env.PUBLIC_API_URL).origin : '',
  };
}

export function configureHttpSecurity(
  app: INestApplication,
  env = process.env,
) {
  const settings = httpSecuritySettings(env);
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  // Only trust the deployment's explicitly configured proxy networks/hops.
  if (env.TRUST_PROXY)
    server.set(
      'trust proxy',
      /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY,
    );
  app.enableCors({ origin: settings.origins, credentials: false });
  const db = app.get(SupabaseService).client.schema('iam');
  app.use(async (req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader('Cache-Control', 'no-store');
    if (settings.production) {
      if (!req.secure) {
        if (['GET', 'HEAD'].includes(req.method))
          return res.redirect(308, settings.apiOrigin + req.originalUrl);
        return res
          .status(400)
          .json({ message: 'Esta operación requiere HTTPS.' });
      }
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    res.on('finish', () => {
      if (
        (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.user) ||
        [401, 403, 429].includes(res.statusCode)
      ) {
        // Route templates only: never query strings, bodies, passwords or tokens.
        Promise.resolve(
          db
            .from('security_events')
            .insert({
              actor_id: req.user?.id || null,
              event: req.method,
              route: req.route?.path || 'unmatched',
              status: res.statusCode,
            }),
        )
          .then((result) => {
            if (result.error) console.error('Security audit write failed');
          })
          .catch(() => console.error('Security audit unavailable'));
      }
    });
    if (
      req.method === 'POST' &&
      /^\/auth\/(login|recover-password|reset-password)\/?$/.test(req.path)
    ) {
      try {
        const { data, error } = await db.rpc('allow_auth_request', {
          p_key: securityKey(
            'ip:' + req.path,
            req.ip || req.socket.remoteAddress || 'unknown',
          ),
          p_limit: req.path.includes('login') ? 30 : 5,
          p_seconds: 60,
        });
        if (error)
          return res
            .status(503)
            .json({ message: 'No se pudo verificar la seguridad del acceso.' });
        if (!data) {
          res.setHeader('Retry-After', '60');
          return res
            .status(429)
            .json({
              message:
                'Demasiados intentos. Espera un minuto e intenta nuevamente.',
            });
        }
      } catch {
        return res
          .status(503)
          .json({ message: 'No se pudo verificar la seguridad del acceso.' });
      }
    }
    next();
  });
}
