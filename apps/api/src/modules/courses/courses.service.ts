import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export interface Course {
  id: string;
  title: string;
  description: string;
  createdBy: string | null;
  docenteId: string | null;
  createdAt: string;
}

interface CourseRow {
  id: string;
  title: string;
  description: string;
  created_by: string | null;
  docente_id: string | null;
  created_at: string;
}

@Injectable()
export class CoursesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(
    input: { title: string; description?: string },
    createdBy: string,
  ): Promise<Course> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('courses')
      .insert({
        title: input.title,
        description: input.description ?? '',
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not create course');
    }
    return this.mapCourse(data as CourseRow);
  }

  async listForUser(user: AuthenticatedUser): Promise<Course[]> {
    if (user.role === 'admin') {
      const { data, error } = await this.supabase.client
        .schema('courses')
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new BadRequestException(error.message);
      return (data as CourseRow[]).map((row) => this.mapCourse(row));
    }

    if (user.role === 'docente') {
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
      .from('enrollments')
      .select(
        'course:courses(id, title, description, created_by, docente_id, created_at)',
      )
      .eq('student_id', user.id);

    if (error) throw new BadRequestException(error.message);
    return (data as unknown as { course: CourseRow }[]).map((row) =>
      this.mapCourse(row.course),
    );
  }

  async enroll(courseId: string, studentId: string, grantedBy: string) {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .upsert(
        { course_id: courseId, student_id: studentId, granted_by: grantedBy },
        { onConflict: 'course_id,student_id' },
      )
      .select('id, course_id, student_id, status, created_at')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not enroll student');
    }
    return data;
  }

  async listEnrollments(courseId: string) {
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

  async assignDocente(courseId: string, docenteId: string): Promise<Course> {
    const { data: profile, error: profileError } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('id, role')
      .eq('id', docenteId)
      .maybeSingle();

    if (profileError) throw new BadRequestException(profileError.message);
    if (!profile) throw new NotFoundException('Docente not found');
    if ((profile as { role: string }).role !== 'docente') {
      throw new BadRequestException(
        'The assigned user must have the docente role',
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

  async isEnrolled(courseId: string, studentId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .select('id')
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle();

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

  async courseIdsForStudent(studentId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .from('enrollments')
      .select('course_id')
      .eq('student_id', studentId)
      .eq('status', 'active');

    if (error) throw new BadRequestException(error.message);
    return (data as { course_id: string }[]).map((row) => row.course_id);
  }

  private mapCourse(row: CourseRow): Course {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      createdBy: row.created_by,
      docenteId: row.docente_id,
      createdAt: row.created_at,
    };
  }
}
