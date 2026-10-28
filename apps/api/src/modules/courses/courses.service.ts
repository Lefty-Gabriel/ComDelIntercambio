import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export interface Course {
  id: string;
  title: string;
  description: string;
  contentType?: string;
  category?: string;
  level?: string;
  createdBy: string | null;
  docenteId: string | null;
  createdAt: string;
}

interface CourseRow {
  id: string;
  title: string;
  description: string;
  content_type?: string;
  category?: string;
  level?: string;
  created_by: string | null;
  docente_id: string | null;
  created_at: string;
}

@Injectable()
export class CoursesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(
    input: {
      title: string;
      description?: string;
      contentType?: 'course' | 'masterclass' | 'workshop';
      docenteId?: string;
      category?: string;
      level?: string;
    },
    user: AuthenticatedUser,
  ): Promise<Course> {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
    if (input.docenteId) {
      const { data: mentor, error } = await this.supabase.client
        .schema('iam')
        .from('profiles')
        .select('role')
        .eq('id', input.docenteId)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (!mentor || mentor.role !== 'mentor')
        throw new BadRequestException('Selecciona una cuenta de mentor');
    }
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .insert({
        title: input.title.trim(),
        category: input.category?.trim() || '',
        level: input.level?.trim() || '',
        description: input.description ?? '',
        content_type: input.contentType || 'course',
        docente_id: input.docenteId || null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not create course',
      );
    }
    return this.mapCourse(data as CourseRow);
  }

  async listForUser(user: AuthenticatedUser): Promise<Course[]> {
    if (!['admin', 'mentor', 'estudiante'].includes(user.role)) {
      throw new ForbiddenException('Academic access required');
    }
    if (user.role === 'admin') {
      const { data, error } = await this.supabase.client
        .schema('courses')
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new BadRequestException(error.message);
      return (data as CourseRow[]).map((row) => this.mapCourse(row));
    }

    if (user.role === 'mentor') {
      const { data, error } = await this.supabase.client
        .schema('courses')
        .from('courses')
        .select('*')
        .eq('docente_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw new BadRequestException(error.message);
      return (data as CourseRow[]).map((row) => this.mapCourse(row));
    }

    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('active_enrollments')
      .select(
        'course:courses(id, title, description, content_type, category, level, created_by, docente_id, created_at)',
      )
      .eq('student_id', user.id);

    if (error) throw new BadRequestException(error.message);
    return (data as unknown as { course: CourseRow }[]).map((row) =>
      this.mapCourse(row.course),
    );
  }

  async assertCanManageCourse(courseId: string, user: AuthenticatedUser) {
    if (user.role === 'admin') return;
    if (
      user.role === 'mentor' &&
      (await this.getCourseDocenteId(courseId)) === user.id
    )
      return;
    throw new ForbiddenException(
      'Solo puedes matricular en los cursos que impartes',
    );
  }

  async enrollByEmail(
    courseId: string,
    email: string,
    user: AuthenticatedUser,
  ) {
    await this.assertCanManageCourse(courseId, user);
    const { data, error } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .eq('role', 'estudiante')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data)
      throw new NotFoundException(
        'No existe un estudiante registrado con ese correo',
      );
    return this.enroll(courseId, data.id, user);
  }

  async enroll(courseId: string, studentId: string, user: AuthenticatedUser) {
    await this.assertCanManageCourse(courseId, user);
    const { data: profile, error: profileError } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, role')
      .eq('id', studentId)
      .maybeSingle();
    if (profileError) throw new BadRequestException(profileError.message);
    if (!profile || profile.role !== 'estudiante')
      throw new BadRequestException(
        'Solo se pueden matricular cuentas de estudiante',
      );
    const { data: existing, error: existingError } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .select(
        'id,course_id,student_id,status,access_type,expires_at,created_at',
      )
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (existingError) throw new BadRequestException(existingError.message);
    if (existing?.course_id) {
      if (
        existing.status !== 'active' ||
        (existing.expires_at &&
          new Date(existing.expires_at).getTime() <= Date.now())
      )
        throw new ForbiddenException(
          'El acceso esta suspendido o vencido. Administracion debe revisarlo en Accesos por programa.',
        );
      return existing;
    }
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .upsert(
        {
          course_id: courseId,
          student_id: studentId,
          granted_by: user.id,
          status: 'active',
        },
        { onConflict: 'course_id,student_id' },
      )
      .select('id, course_id, student_id, status, created_at')
      .single();

    if (error || !data) {
      throw new BadRequestException(
        error?.message ?? 'Could not enroll student',
      );
    }
    return data;
  }

  async listEnrollments(courseId: string, user: AuthenticatedUser) {
    if (
      user.role !== 'admin' &&
      !(
        user.role === 'mentor' &&
        (await this.getCourseDocenteId(courseId)) === user.id
      )
    ) {
      throw new ForbiddenException(
        'You cannot view enrollments for this course',
      );
    }
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .select('id, course_id, student_id, status, created_at')
      .eq('course_id', courseId);

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async getCourseDocenteId(courseId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .select('docente_id')
      .eq('id', courseId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return (data as { docente_id: string | null } | null)?.docente_id ?? null;
  }

  async assignDocente(
    courseId: string,
    docenteId: string,
    user: AuthenticatedUser,
  ): Promise<Course> {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
    const { data: profile, error: profileError } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, role')
      .eq('id', docenteId)
      .maybeSingle();

    if (profileError) throw new BadRequestException(profileError.message);
    if (!profile) throw new NotFoundException('Docente not found');
    if ((profile as { role: string }).role !== 'mentor') {
      throw new BadRequestException(
        'The assigned user must have the mentor role',
      );
    }

    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .update({ docente_id: docenteId, updated_at: new Date().toISOString() })
      .eq('id', courseId)
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Course not found');
    }
    return this.mapCourse(data as CourseRow);
  }

  async isEnrolled(
    courseId: string,
    studentId: string,
    capability?: 'can_view_content' | 'can_join_live' | 'can_view_recordings',
  ): Promise<boolean> {
    let query = this.supabase.client
      .schema('courses')
      .from('active_enrollments')
      .select('id')
      .eq('course_id', courseId)
      .eq('student_id', studentId);
    if (capability) query = query.eq(capability, true);
    const { data, error } = await query.maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return data !== null;
  }

  async courseIdsForDocente(docenteId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .select('id')
      .eq('docente_id', docenteId);

    if (error) throw new BadRequestException(error.message);
    return (data as { id: string }[]).map((row) => row.id);
  }

  async courseIdsForStudent(
    studentId: string,
    capability?: 'can_view_content' | 'can_join_live' | 'can_view_recordings',
  ): Promise<string[]> {
    let query = this.supabase.client
      .schema('courses')
      .from('active_enrollments')
      .select('course_id')
      .eq('student_id', studentId);
    if (capability) query = query.eq(capability, true);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (data || []).map((row) => row.course_id);
  }

  private mapCourse(row: CourseRow): Course {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      contentType: row.content_type || 'course',
      category: row.category || '',
      level: row.level || '',
      createdBy: row.created_by,
      docenteId: row.docente_id,
      createdAt: row.created_at,
    };
  }
}
