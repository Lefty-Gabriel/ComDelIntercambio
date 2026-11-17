import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { LiveSessionsService } from './live-sessions.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
@Injectable()
export class ZoomMeetingService {
  constructor(private readonly sessions: LiveSessionsService, private readonly config: ConfigService) {}
  async join(user: AuthenticatedUser, id: string) {
    const session = await this.sessions.getById(user, id);
    if (session.status === 'ended' || Date.now() >= new Date(session.scheduledAt).getTime() + session.durationMinutes * 60000) throw new BadRequestException('Esta clase ya finalizo. Revisa las grabaciones disponibles.');
    const clientId = this.config.get<string>('ZOOM_MEETING_CLIENT_ID');
    const secret = this.config.get<string>('ZOOM_MEETING_CLIENT_SECRET');
    if (!clientId || !secret) throw new ServiceUnavailableException('La clase dentro de la plataforma aun no esta activada. Administracion debe conectar la cuenta de Zoom. Puedes ingresar usando Abrir en Zoom.');
    let link: URL | null = null;
    try { const candidate = new URL(session.joinUrl || ''); if (candidate.protocol === 'https:' && /(^|\.)zoom\.(us|com)$/i.test(candidate.hostname)) link = candidate; } catch {}
    const meetingNumber = session.meetingId?.replace(/[\s-]/g, '') || link?.pathname.match(/\/(?:j|w)\/(\d{9,11})(?:\/|$)/)?.[1];
    if (!meetingNumber || !/^\d{9,11}$/.test(meetingNumber)) throw new BadRequestException('Administracion debe guardar un ID de reunion de Zoom valido en esta clase.');
    if (link?.searchParams.has('pwd') && !session.meetingPasscode) throw new BadRequestException('Administracion debe guardar el codigo de acceso de invitados para ingresar desde la plataforma.');
    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 3600;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const content = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ appKey: clientId, mn: meetingNumber, role: 0, iat, exp, tokenExp: exp });
    const signature = content + '.' + createHmac('sha256', secret).update(content).digest('base64url');
    return { signature, sdkKey: clientId, meetingNumber, password: session.meetingPasscode || '', userName: user.fullName || user.email, userEmail: user.email, registrantToken: link?.searchParams.get('tk') || '' };
  }
}
