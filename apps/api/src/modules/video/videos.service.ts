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

interface VideoRow {
  id: string;
  course_id: string;
  title: string;
  description: string;
  storage_path: string;
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
      courseId: string;
      title: string;
      description?: string;
      mimeType?: string;
      sizeBytes?: number;
      durationSeconds?: number;
    },
  ) {
    await this.assertCanManageCourse(user, input.courseId);

    const id = randomUUID();
    const storagePath = `${input.courseId}/${id}`;
    const expiresAt = this.computeExpiry();

    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .insert({
        id,
        course_id: input.courseId,
        title: input.title,
        description: input.description ?? '',
        storage_path: storagePath,
        mime_type: input.mimeType ?? 'video/mp4',
        size_bytes: input.sizeBytes ?? 0,
        duration_seconds: input.durationSeconds ?? null,
        status: 'pending',
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not create video');
    }

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

    const { data, error } = await this.supabase.client
      .schema('video')
      .from('videos')
      .update({
        status: 'ready',
        size_bytes: input.sizeBytes ?? row.size_bytes,
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
      const { data, error } = await query
        .in('course_id', courseIds)
        .order('created_at', { ascending: false });
      if (error) throw new BadRequestException(error.message);
      return (data as VideoRow[]).map((row) => this.mapVideo(row));
    }

    courseIds = await this.courses.courseIdsForStudent(user.id);
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
    const enrolled = await this.courses.isEnrolled(row.course_id, user.id);
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

  private async deleteRow(id: string, storagePath?: string): Promise<void> {
    if (storagePath) {
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
