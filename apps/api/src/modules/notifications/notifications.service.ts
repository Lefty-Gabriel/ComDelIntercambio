import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import { CoursesService } from '../courses/courses.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { PublishAnnouncementDto } from './notifications.dto.js';
@Injectable()
export class NotificationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly courses: CoursesService,
  ) {}
  async list(user: AuthenticatedUser) {
    if (!['admin', 'mentor', 'estudiante'].includes(user.role)) return [];
    const { data, error } = await this.supabase.client
      .schema('courses')
      .rpc('notification_feed', { p_user_id: user.id });
    if (error) throw new BadRequestException(error.message);
    return (data || []).map((row: any) => ({
      id: row.id,
      type: row.type,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      createdAt: row.occurred_at,
      read: row.is_read,
    }));
  }
  async markRead(user: AuthenticatedUser, ids: string[]) {
    if (!ids.length) return { updated: 0 };
    const visible = new Set(
      (await this.list(user)).map((item: any) => item.id),
    );
    const allowed = ids.filter((id) => visible.has(id));
    if (!allowed.length) return { updated: 0 };
    const { error } = await this.supabase.client
      .schema('courses')
      .from('notification_reads')
      .upsert(
        allowed.map((id) => ({
          user_id: user.id,
          notification_id: id,
          read_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,notification_id' },
      );
    if (error) throw new BadRequestException(error.message);
    return { updated: allowed.length };
  }
  async publish(user: AuthenticatedUser, input: PublishAnnouncementDto) {
    if (input.title.trim().length < 3 || input.body.trim().length < 3)
      throw new BadRequestException('Completa el titulo y el mensaje');
    if (user.role !== 'admin' && user.role !== 'mentor')
      throw new ForbiddenException('No puedes publicar avisos');
    if (user.role === 'mentor') {
      if (!input.courseId)
        throw new ForbiddenException('Selecciona uno de tus cursos');
      await this.courses.assertCanManageCourse(input.courseId, user);
    }
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now())
      throw new BadRequestException('La fecha de vencimiento debe ser futura');
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('announcements')
      .insert({
        course_id: input.courseId || null,
        title: input.title.trim(),
        body: input.body.trim(),
        kind: input.kind,
        audience: 'all',
        is_published: true,
        created_by: user.id,
        published_at: new Date().toISOString(),
        expires_at: input.expiresAt || null,
      })
      .select('id')
      .single();
    if (error || !data)
      throw new BadRequestException(
        error?.message || 'No se pudo publicar el aviso',
      );
    return { id: data.id };
  }
}
