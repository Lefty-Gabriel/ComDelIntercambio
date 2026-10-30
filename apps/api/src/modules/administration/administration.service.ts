import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { CreateCourseDto } from '../courses/dto/create-course.dto.js';
import type {
  AccessInputDto,
  GrantAccessDto,
  LessonInputDto,
  ListAccessDto,
  ModuleInputDto,
  ResourceLinkDto,
} from './administration.dto.js';
@Injectable()
export class AdministrationService {
  constructor(private readonly supabase: SupabaseService) {}
  private admin(user: AuthenticatedUser) {
    if (user.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
  }
  private async assertCourseEditor(user: AuthenticatedUser, courseId: string) {
    if (!['admin', 'mentor'].includes(user.role)) throw new ForbiddenException('Academic editing access required');
    const course = await this.course(courseId);
    if (user.role !== 'admin' && course.docente_id !== user.id)
      throw new ForbiddenException('Solo puedes editar el contenido de tus cursos asignados');
    return course;
  }
  private async assertLessonEditor(user: AuthenticatedUser, lessonId: string) {
    const lesson = await this.lesson(lessonId);
    const module = await this.module(lesson.module_id);
    await this.assertCourseEditor(user, module.course_id);
    return { lesson, module };
  }
  private db(table: string) {
    return this.supabase.client.schema('courses').from(table);
  }
  private failure(error: any) {
    throw new BadRequestException(
      error?.code === '23505'
        ? 'La posicion o el video ya esta utilizado. Revisa los datos y vuelve a guardar.'
        : error?.message || 'No se pudo guardar',
    );
  }
  private async course(courseId: string) {
    const { data, error } = await this.db('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle();
    if (error) this.failure(error);
    if (!data) throw new NotFoundException('Curso no encontrado');
    return data;
  }
  private async module(id: string) {
    const { data, error } = await this.db('course_modules')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.failure(error);
    if (!data) throw new NotFoundException('Modulo no encontrado');
    return data;
  }
  private async lesson(id: string) {
    const { data, error } = await this.db('lessons')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.failure(error);
    if (!data) throw new NotFoundException('Leccion no encontrada');
    return data;
  }
  async updateCourse(
    user: AuthenticatedUser,
    id: string,
    input: CreateCourseDto,
  ) {
    this.admin(user);
    await this.course(id);
    if (input.title.trim().length < 3)
      throw new BadRequestException(
        'Escribe un titulo de al menos tres caracteres',
      );
    if (input.docenteId) {
      const { data, error } = await this.supabase.client
        .schema('iam')
        .from('profiles')
        .select('role')
        .eq('id', input.docenteId)
        .maybeSingle();
      if (error) this.failure(error);
      if (data?.role !== 'mentor')
        throw new BadRequestException('Selecciona una cuenta de mentor');
    }
    const { data, error } = await this.db('courses')
      .update({
        title: input.title.trim(),
        description: input.description?.trim() || '',
        content_type: input.contentType || 'course',
        category: input.category?.trim() || '',
        level: input.level?.trim() || '',
        docente_id: input.docenteId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) this.failure(error);
    return data;
  }
  async curriculum(user: AuthenticatedUser, courseId: string) {
    const course = await this.assertCourseEditor(user, courseId);
    const { data: modules, error: me } = await this.db('course_modules')
      .select('*')
      .eq('course_id', courseId)
      .order('position');
    if (me) this.failure(me);
    const moduleIds = (modules || []).map((m) => m.id);
    const { data: lessons, error: le } = moduleIds.length
      ? await this.db('lessons')
          .select('*')
          .in('module_id', moduleIds)
          .order('position')
      : { data: [], error: null };
    if (le) this.failure(le);
    const lessonIds = (lessons || []).map((l) => l.id);
    const { data: resources, error: re } = lessonIds.length
      ? await this.db('lesson_resources')
          .select(
            'id,lesson_id,title,description,kind,resource_type,is_published,external_url,mime_type,size_bytes,position',
          )
          .in('lesson_id', lessonIds)
          .order('position')
      : { data: [], error: null };
    if (re) this.failure(re);
    const { data: videos, error: ve } = await this.supabase.client
      .schema('video')
      .from('videos')
      .select('id,title,status')
      .eq('course_id', courseId)
      .eq('status', 'ready');
    if (ve) this.failure(ve);
    return {
      course,
      modules: (modules || []).map((m) => ({
        ...m,
        lessons: (lessons || [])
          .filter((l) => l.module_id === m.id)
          .map((l) => ({
            ...l,
            resources: (resources || []).filter((r) => r.lesson_id === l.id),
          })),
      })),
      videos: videos || [],
    };
  }
  async saveModule(
    user: AuthenticatedUser,
    courseId: string,
    input: ModuleInputDto,
    id?: string,
  ) {
    await this.assertCourseEditor(user, courseId);
    if (input.title.trim().length < 2)
      throw new BadRequestException('Escribe el titulo del modulo');
    if (id && (await this.module(id)).course_id !== courseId)
      throw new BadRequestException('El modulo no pertenece al curso');
    const fields = {
      title: input.title.trim(),
      position: input.position,
      updated_at: new Date().toISOString(),
    };
    const query = id
      ? this.db('course_modules').update(fields).eq('id', id)
      : this.db('course_modules').insert({ ...fields, course_id: courseId });
    const { data, error } = await query.select('*').single();
    if (error) this.failure(error);
    return data;
  }
  async saveLesson(
    user: AuthenticatedUser,
    moduleId: string,
    input: LessonInputDto,
    id?: string,
  ) {
    const module = await this.module(moduleId);
    await this.assertCourseEditor(user, module.course_id);
    if (id && (await this.lesson(id)).module_id !== moduleId)
      throw new BadRequestException('La leccion no pertenece al modulo');
    if (input.title.trim().length < 2)
      throw new BadRequestException('Escribe el titulo de la leccion');
    if (input.videoId) {
      const { data, error } = await this.supabase.client
        .schema('video')
        .from('videos')
        .select('course_id,status')
        .eq('id', input.videoId)
        .maybeSingle();
      if (error) this.failure(error);
      if (
        !data ||
        data.course_id !== module.course_id ||
        data.status !== 'ready'
      )
        throw new BadRequestException(
          'El video debe estar disponible y pertenecer al mismo curso',
        );
    }
    const fields = {
      title: input.title.trim(),
      summary: input.summary?.trim() || '',
      content_text: input.content || '',
      position: input.position,
      duration_minutes: input.durationMinutes,
      is_published: input.isPublished,
      video_id: input.videoId || null,
      updated_at: new Date().toISOString(),
    };
    const query = id
      ? this.db('lessons').update(fields).eq('id', id)
      : this.db('lessons').insert({ ...fields, module_id: moduleId });
    const { data, error } = await query.select('*').single();
    if (error) this.failure(error);
    return data;
  }
  async addResourceLink(
    user: AuthenticatedUser,
    lessonId: string,
    input: ResourceLinkDto,
  ) {
    await this.assertLessonEditor(user, lessonId);
    const { data, error } = await this.db('lesson_resources')
      .insert({
        lesson_id: lessonId,
        title: input.title.trim(),
        description: input.description || '',
        kind: input.kind,
        resource_type: input.resourceType,
        external_url: input.externalUrl,
        is_published: input.isPublished,
      })
      .select('*')
      .single();
    if (error) this.failure(error);
    return data;
  }
  async uploadResource(
    user: AuthenticatedUser,
    lessonId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    title?: string,
  ) {
    const { module } = await this.assertLessonEditor(user, lessonId);
    if (!file?.buffer?.length)
      throw new BadRequestException('Selecciona un archivo');
    const extension = extname(file.originalname).toLowerCase();
    if (
      ![
        '.pdf',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.csv',
        '.ppt',
        '.pptx',
        '.zip',
        '.txt',
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
        '.mp3',
        '.wav',
        '.ogg',
      ].includes(extension)
    )
      throw new BadRequestException('Formato de material no admitido');
    const path =
      module.course_id + '/' + lessonId + '/' + randomUUID() + extension;
    const { error: uploadError } = await this.supabase.client.storage
      .from('course-resources')
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) this.failure(uploadError);
    const { data, error } = await this.db('lesson_resources')
      .insert({
        lesson_id: lessonId,
        title: title?.trim() || file.originalname,
        kind: 'download',
        resource_type: 'document',
        storage_path: path,
        mime_type: file.mimetype,
        size_bytes: file.size,
        is_published: false,
      })
      .select('*')
      .single();
    if (error) {
      await this.supabase.client.storage
        .from('course-resources')
        .remove([path]);
      this.failure(error);
    }
    return data;
  }
  async resourceState(user: AuthenticatedUser, id: string, published: boolean) {
    const { data: resource, error: resourceError } = await this.db('lesson_resources')
      .select('lesson_id').eq('id', id).maybeSingle();
    if (resourceError) this.failure(resourceError);
    if (!resource) throw new NotFoundException('Material no encontrado');
    await this.assertLessonEditor(user, resource.lesson_id);
    const { data, error } = await this.db('lesson_resources')
      .update({ is_published: published, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,is_published')
      .single();
    if (error) this.failure(error);
    return data;
  }
  async listAccess(user: AuthenticatedUser, input: ListAccessDto) {
    this.admin(user);
    const page = input.page || 0;
    let query = this.db('enrollments').select(
      'id,course_id,student_id,status,access_type,expires_at,created_at',
      { count: 'exact' },
    );
    if (input.courseId) query = query.eq('course_id', input.courseId);
    if (input.studentId) query = query.eq('student_id', input.studentId);
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * 50, page * 50 + 49);
    if (error) this.failure(error);
    return { items: data || [], total: count || 0, page };
  }
  private validity(input: AccessInputDto) {
    if (
      input.status === 'active' &&
      input.expiresAt &&
      new Date(input.expiresAt).getTime() <= Date.now()
    )
      throw new BadRequestException(
        'La vigencia del acceso activo debe ser futura',
      );
  }
  async grantAccess(user: AuthenticatedUser, input: GrantAccessDto) {
    this.admin(user);
    this.validity(input);
    await this.course(input.courseId);
    const { data: student, error: pe } = await this.supabase.client
      .schema('iam')
      .from('profiles')
      .select('role')
      .eq('id', input.studentId)
      .maybeSingle();
    if (pe) this.failure(pe);
    if (student?.role !== 'estudiante')
      throw new BadRequestException('Selecciona una cuenta de estudiante');
    const { data, error } = await this.db('enrollments')
      .upsert(
        {
          course_id: input.courseId,
          student_id: input.studentId,
          status: input.status,
          access_type: input.accessType,
          expires_at: input.expiresAt || null,
          granted_by: user.id,
        },
        { onConflict: 'course_id,student_id' },
      )
      .select('*')
      .single();
    if (error) this.failure(error);
    return data;
  }
  async updateAccess(
    user: AuthenticatedUser,
    id: string,
    input: AccessInputDto,
  ) {
    this.admin(user);
    this.validity(input);
    const { data, error } = await this.db('enrollments')
      .update({
        status: input.status,
        access_type: input.accessType,
        expires_at: input.expiresAt || null,
        granted_by: user.id,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) this.failure(error);
    return data;
  }
}
