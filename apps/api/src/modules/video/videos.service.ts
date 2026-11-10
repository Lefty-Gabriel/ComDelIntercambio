import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CoursesService } from '../courses/courses.service.js';

export const VIDEO_BUCKET = 'course-videos';
const PLAYBACK_URL_TTL_SECONDS = 3600;
const DEFAULT_RETENTION_DAYS = 180;

export function vimeoEmbedUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException('Introduce un enlace valido de Vimeo'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname))
    throw new BadRequestException('Solo se admiten enlaces HTTPS de Vimeo');
  const match = url.hostname === 'player.vimeo.com'
    ? /^\/video\/(\d+)\/?$/.exec(url.pathname)
    : /^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(url.pathname);
  if (!match) throw new BadRequestException('Enlace de video de Vimeo no valido');
  const hash = match[2] || url.searchParams.get('h');
  if (hash && !/^[a-zA-Z0-9]+$/.test(hash)) throw new BadRequestException('Codigo privado de Vimeo no valido');
  const embed = new URL('https://player.vimeo.com/video/' + match[1]);
  if (hash) embed.searchParams.set('h', hash);
  return embed.toString();
}

// Compatibility with databases that only have the original video metadata columns.
// This reserved path is a reference, never an uploaded Storage object.
function legacyVimeoUrl(path?: string | null): string | null {
  const match = /^external\/vimeo\/[^/]+\/(.+)$/.exec(path || '');
  if (!match) return null;
  try { return vimeoEmbedUrl(decodeURIComponent(match[1])); }
  catch { throw new BadRequestException('Referencia de Vimeo no valida'); }
}

interface VideoRow {
  id: string;
  course_id: string;
  live_session_id?: string | null;
  title: string;
  description: string;
  storage_path: string | null;
  source_type?: 'storage' | 'vimeo';
  external_url?: string | null;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  status: 'pending' | 'ready' | 'error';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface Video {
  id: string;
  courseId: string;
  liveSessionId?: string | null;
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: VideoRow['status'];
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
}

@Injectable()
export class VideosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly courses: CoursesService,
    private readonly config: ConfigService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: {
      externalUrl?: string;
      liveSessionId?: string;
      courseId: string;
      title: string;
      description?: string;
      mimeType?: string;
      sizeBytes?: number;
      durationSeconds?: number;
    },
  ) {
    await this.assertCanManageCourse(user, input.courseId);
    if (input.liveSessionId) {
      const { data, error } = await this.supabase.client
        .schema('video')
        .from('live_sessions')
        .select('course_id')
        .eq('id', input.liveSessionId)
        .maybeSingle();
      if (error || !data || data.course_id !== input.courseId)
        throw new BadRequestException(
          'La clase debe pertenecer al curso seleccionado',
        );
    }

    const externalUrl = input.externalUrl ? vimeoEmbedUrl(input.externalUrl) : null;
    if (externalUrl && user.role !== 'admin') throw new ForbiddenException('Solo administradores pueden publicar enlaces de Vimeo');
    if (!externalUrl && input.sizeBytes) {
      const { data: bucket, error: bucketError } = await this.supabase.client.storage.getBucket(VIDEO_BUCKET);
      if (bucketError) throw new BadRequestException('No se pudo comprobar el almacenamiento. Intenta nuevamente.');
      const configured = Number(this.config.get<string>('VIDEO_MAX_UPLOAD_BYTES'));
      const limits = [2 * 1024 ** 3, Number(bucket?.file_size_limit), configured].filter(n => Number.isFinite(n) && n > 0);
      const maximum = Math.min(...limits);
      if (input.sizeBytes > maximum) throw new BadRequestException('El archivo supera el limite configurado de ' + Math.floor(maximum / 1024 ** 2) + ' MB. Usa un enlace de video o un archivo mas pequeno.');
    }
    const id = randomUUID();
    const storagePath = `${input.courseId}/${id}`;
    const expiresAt = this.computeExpiry();

    const record = {
        id,
        course_id: input.courseId,
        live_session_id: input.liveSessionId || null,
        title: input.title,
        description: input.description ?? '',
        storage_path: externalUrl ? null : storagePath,
        source_type: externalUrl ? 'vimeo' : 'storage',
        external_url: externalUrl,
        mime_type: input.mimeType ?? 'video/mp4',
        size_bytes: input.sizeBytes ?? 0,
        duration_seconds: input.durationSeconds ?? null,
        status: externalUrl ? 'ready' : 'pending',
        created_by: user.id,
        expires_at: externalUrl ? null : expiresAt,
    };
    const insert = (payload: object) => this.supabase.client.schema('video').from('videos').insert(payload).select('*').single();
    let { data, error } = await insert(record);
    // PostgREST rejects unknown fields before inserting: retry only this precise
    // schema mismatch, never a network error or an ambiguous failed response.
    if (error && ['PGRST204', '42703'].includes(error.code) && /external_url|source_type/.test(error.message)) {
      const { source_type: _source, external_url: _url, ...legacyRecord } = record;
      const result = await insert({
        ...legacyRecord,
        storage_path: externalUrl ? 'external/vimeo/' + id + '/' + encodeURIComponent(externalUrl) : storagePath,
      });
      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not create video');
    }

    if (externalUrl) return { video: this.mapVideo(data as VideoRow), upload: null };
    const upload = await this.supabase.client.storage
      .from(VIDEO_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (upload.error || !upload.data) {
      await this.deleteRow(id);
      throw new BadRequestException(
        upload.error?.message ?? 'Could not create upload URL',
      );
    }

    return {
      video: this.mapVideo(data as VideoRow),
      upload: {
        path: upload.data.path,
        token: upload.data.token,
        signedUrl: upload.data.signedUrl,
      },
    };
  }

  async complete(
    user: AuthenticatedUser,
    id: string,
    input: { sizeBytes?: number; durationSeconds?: number; mimeType?: string },
  ): Promise<Video> {
    const row = await this.getRowOrFail(id);
    await this.assertCanManageVideo(user, row);
    if (row.source_type === 'vimeo' || legacyVimeoUrl(row.storage_path)) throw new BadRequestException('Este enlace ya esta publicado');
    if (!row.storage_path) throw new BadRequestException('Video sin archivo');
    const { data: object, error: objectError } = await this.supabase.client.storage.from(VIDEO_BUCKET).info(row.storage_path);
    if (objectError || !object) throw new BadRequestException('El archivo no termino de subirse. Vuelve a intentar la carga.');
    const uploadedSize = Number(object.size);
    if (!uploadedSize || (row.size_bytes > 0 && uploadedSize !== Number(row.size_bytes))) throw new BadRequestException('La subida esta incompleta. El video no fue publicado.');

    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .update({
        status: 'ready',
        size_bytes: uploadedSize,
        duration_seconds: input.durationSeconds ?? row.duration_seconds,
        mime_type: input.mimeType ?? row.mime_type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not complete video',
      );
    }
    return this.mapVideo(data as VideoRow);
  }

  async list(user: AuthenticatedUser): Promise<Video[]> {
    if (!['admin', 'mentor', 'estudiante'].includes(user.role))
      throw new ForbiddenException('Academic access required');
    const query = this.supabase.client
      .schema('video')
      .from('videos')
      .select('*');

    if (user.role === 'admin') {
      const { data, error } = await query.order('created_at', {
        ascending: false,
      });
      if (error) throw new BadRequestException(error.message);
      return (data as VideoRow[]).map((row) => this.mapVideo(row));
    }

    let courseIds: string[];
    if (user.role === 'mentor') {
      courseIds = await this.courses.courseIdsForDocente(user.id);
      if (!courseIds.length) return [];
      const { data, error } = await query
        .in('course_id', courseIds)
        .order('created_at', { ascending: false });
      if (error) throw new BadRequestException(error.message);
      return (data as VideoRow[]).map((row) => this.mapVideo(row));
    }

    courseIds = await this.courses.courseIdsForStudent(user.id, 'can_view_recordings');
    if (!courseIds.length) return [];
    const { data, error } = await query
      .in('course_id', courseIds)
      .eq('status', 'ready')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data as VideoRow[]).map((row) => this.mapVideo(row));
  }

  async getById(user: AuthenticatedUser, id: string): Promise<Video> {
    const row = await this.getRowOrFail(id);
    await this.assertCanViewVideo(user, row);
    return this.mapVideo(row);
  }

  async playback(user: AuthenticatedUser, id: string) {
    const row = await this.getRowOrFail(id);
    await this.assertCanViewVideo(user, row);

    if (row.status !== 'ready') {
      throw new BadRequestException('Video is not ready for playback yet');
    }

    if (row.source_type === 'vimeo' && row.external_url) return { url: vimeoEmbedUrl(row.external_url), kind: 'vimeo', expiresIn: null };
    const legacyUrl = legacyVimeoUrl(row.storage_path);
    if (legacyUrl) return { url: legacyUrl, kind: 'vimeo', expiresIn: null };
    if (!row.storage_path) throw new BadRequestException('Video sin archivo');
    const { data, error } = await this.supabase.client.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(row.storage_path, PLAYBACK_URL_TTL_SECONDS);

    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not sign playback URL',
      );
    }

    return { url: data.signedUrl, expiresIn: PLAYBACK_URL_TTL_SECONDS };
  }

  async remove(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ deleted: true }> {
    const row = await this.getRowOrFail(id);
    await this.assertCanManageVideo(user, row);
    await this.deleteRow(id, row.storage_path);
    return { deleted: true };
  }

  async purgeExpired(): Promise<number> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .select('id, storage_path')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString());

    if (error) throw new BadRequestException(error.message);

    const rows = (data as { id: string; storage_path: string }[]) ?? [];
    for (const row of rows) {
      await this.deleteRow(row.id, row.storage_path);
    }
    return rows.length;
  }

  private async assertCanManageCourse(
    user: AuthenticatedUser,
    courseId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    if (user.role === 'mentor') {
      const docenteId = await this.courses.getCourseDocenteId(courseId);
      if (docenteId === user.id) return;
    }
    throw new ForbiddenException('You cannot manage videos for this course');
  }

  private async assertCanManageVideo(
    user: AuthenticatedUser,
    row: VideoRow,
  ): Promise<void> {
    await this.assertCanManageCourse(user, row.course_id);
  }

  private async assertCanViewVideo(
    user: AuthenticatedUser,
    row: VideoRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    if (user.role === 'mentor') {
      const docenteId = await this.courses.getCourseDocenteId(row.course_id);
      if (docenteId === user.id) return;
      throw new ForbiddenException('You cannot view this video');
    }
    if (user.role !== 'estudiante')
      throw new ForbiddenException('Academic access required');
    const enrolled = await this.courses.isEnrolled(row.course_id, user.id, 'can_view_recordings');
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
  }

  private computeExpiry(): string {
    const configured = Number(
      this.config.get<string>('VIDEO_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS,
    );
    const days =
      Number.isFinite(configured) && configured > 0
        ? Math.min(configured, DEFAULT_RETENTION_DAYS)
        : DEFAULT_RETENTION_DAYS;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  private async getRowOrFail(id: string): Promise<VideoRow> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Video not found');
    return data as VideoRow;
  }

  private async deleteRow(id: string, storagePath?: string | null): Promise<void> {
    if (storagePath && !legacyVimeoUrl(storagePath)) {
      const { error } = await this.supabase.client.storage
        .from(VIDEO_BUCKET)
        .remove([storagePath]);
      if (error) throw new BadRequestException(error.message);
    }

    const { error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .delete()
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
  }

  private mapVideo(row: VideoRow): Video {
    return {
      id: row.id,
      courseId: row.course_id,
      liveSessionId: row.live_session_id || null,
      title: row.title,
      description: row.description,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      durationSeconds: row.duration_seconds,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }
}
