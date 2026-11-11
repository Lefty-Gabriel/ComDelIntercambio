import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
@Injectable()
export class CommunicationService {
  constructor(private readonly supabase: SupabaseService) {}
  private async call(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .schema('courses')
      .rpc(name, args);
    if (error) {
      if (error.code === '42501') throw new ForbiddenException(error.message);
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    return data;
  }
  async forum(
    user: AuthenticatedUser,
    action: string,
    input: Record<string, unknown> = {},
  ) {
    if (!['estudiante', 'mentor', 'admin'].includes(user.role))
      throw new ForbiddenException('Academic community access required');
    return this.call('forum_action', {
      p_actor_id: user.id,
      p_action: action,
      p_input: input,
    });
  }
  async chat(
    user: AuthenticatedUser,
    action: string,
    studentId: string | null = null,
    input: { body?: string; mentorId?: string } = {},
  ) {
    // RolesGuard admits administrators globally; private messages deliberately do not.
    if (!['estudiante', 'mentor'].includes(user.role))
      throw new ForbiddenException(
        'Only assigned students and mentors can access private messages',
      );
    return this.call('mentor_chat_action', {
      p_actor_id: user.id,
      p_action: action,
      p_student_id: studentId,
      p_body: input.body?.trim() ?? null,
      p_expected_mentor_id: input.mentorId ?? null,
    });
  }
}
