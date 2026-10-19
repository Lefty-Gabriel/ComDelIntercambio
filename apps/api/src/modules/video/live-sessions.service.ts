import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CoursesService } from '../courses/courses.service.js';
import { LivekitService } from './livekit.service.js';

interface LiveSessionRow {
  id: string;
  course_id: string;
  title: string;
  room_name: string;
  status: 'scheduled' | 'live' | 'ended';
  started_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface LiveSession {
  id: string;
  courseId: string;
  title: string;
  roomName: string;
  status: LiveSessionRow['status'];
  startedBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

@Injectable()
export class LiveSessionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly courses: CoursesService,
    private readonly livekit: LivekitService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: { courseId: string; title: string },
  ): Promise<LiveSession> {
    await this.assertCanManageCourse(user, input.courseId);

    const id = randomUUID();
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .insert({
        id,
        course_id: input.courseId,
        title: input.title,
        room_name: `session_${id}`,
        status: 'scheduled',
        started_by: user.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not create live session',
      );
    }
    return this.mapSession(data as LiveSessionRow);
  }

  async list(user: AuthenticatedUser): Promise<LiveSession[]> {
    if (!['admin', 'mentor', 'estudiante'].includes(user.role))
      throw new ForbiddenException('Academic access required');
    const query = this.supabase.client
      .schema('video')
      .from('live_sessions')
      .select('*');

    if (user.role === 'admin') {
      const { data, error } = await query.order('created_at', {
        ascending: false,
      });
      if (error) throw new BadRequestException(error.message);
      return (data as LiveSessionRow[]).map((row) => this.mapSession(row));
    }

    const courseIds =
      user.role === 'mentor'
        ? await this.courses.courseIdsForDocente(user.id)
        : await this.courses.courseIdsForStudent(user.id);

    const { data, error } = await query
      .in('course_id', courseIds)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data as LiveSessionRow[]).map((row) => this.mapSession(row));
  }

  async getById(user: AuthenticatedUser, id: string): Promise<LiveSession> {
    const row = await this.getRowOrFail(id);
    await this.assertCanView(user, row);
    return this.mapSession(row);
  }

  async join(user: AuthenticatedUser, id: string) {
    const row = await this.getRowOrFail(id);
    await this.assertCanView(user, row);

    if (row.status === 'ended') {
      throw new BadRequestException('This live session has ended');
    }

    const canPublish = await this.canPublish(user, row);

    if (canPublish && row.status === 'scheduled') {
      const { error } = await this.supabase.client
        .schema('video')
        .from('live_sessions')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new BadRequestException(error.message);
    }

    const token = await this.livekit.createJoinToken({
      identity: user.id,
      name: user.fullName || user.email,
      room: row.room_name,
      canPublish,
    });

    return { url: this.livekit.url, room: row.room_name, token, canPublish };
  }

  async end(user: AuthenticatedUser, id: string): Promise<LiveSession> {
    const row = await this.getRowOrFail(id);
    await this.assertCanManageCourse(user, row.course_id);

    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not end session');
    }
    return this.mapSession(data as LiveSessionRow);
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
    throw new ForbiddenException(
      'You cannot manage live sessions for this course',
    );
  }

  private async assertCanView(
    user: AuthenticatedUser,
    row: LiveSessionRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    if (user.role === 'mentor') {
      const docenteId = await this.courses.getCourseDocenteId(row.course_id);
      if (docenteId === user.id) return;
      throw new ForbiddenException('You cannot view this live session');
    }
    if (user.role !== 'estudiante')
      throw new ForbiddenException('Academic access required');
    const enrolled = await this.courses.isEnrolled(row.course_id, user.id);
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
  }

  private async canPublish(
    user: AuthenticatedUser,
    row: LiveSessionRow,
  ): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (user.role === 'mentor') {
      const docenteId = await this.courses.getCourseDocenteId(row.course_id);
      return docenteId === user.id;
    }
    return false;
  }

  private async getRowOrFail(id: string): Promise<LiveSessionRow> {
    const { data, error } = await this.supabase.client
      .schema('video')
      .from('live_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Live session not found');
    return data as LiveSessionRow;
  }

  private mapSession(row: LiveSessionRow): LiveSession {
    return {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      roomName: row.room_name,
      status: row.status,
      startedBy: row.started_by,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
    };
  }
}
