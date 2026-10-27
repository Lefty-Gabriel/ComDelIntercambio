import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
interface Ticket {
  id: string;
  student_id: string;
  assigned_to: string | null;
  status: 'open' | 'in_progress' | 'closed';
}
@Injectable()
export class TicketsService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() {
    return this.supabase.client.schema('support');
  }
  private assertRole(user: AuthenticatedUser) {
    if (!['estudiante', 'soporte'].includes(user.role))
      throw new ForbiddenException('Student or support access required');
  }
  async list(user: AuthenticatedUser) {
    this.assertRole(user);
    return this.allPages((from, to) => {
      let query = this.db.from('tickets').select('*');
      if (user.role === 'estudiante') query = query.eq('student_id', user.id);
      return query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
    });
  }
  private async allPages(
    fetchPage: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  ) {
    const rows: any[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await fetchPage(from, from + pageSize - 1);
      if (error) throw new BadRequestException(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) return rows;
    }
  }

  async create(user: AuthenticatedUser, subject: string, message: string) {
    if (user.role !== 'estudiante')
      throw new ForbiddenException('Only students can create tickets');
    return this.rpc('create_ticket', {
      p_actor_id: user.id,
      p_subject: subject.trim(),
      p_body: message.trim(),
    });
  }
  private async ticket(user: AuthenticatedUser, id: string): Promise<Ticket> {
    this.assertRole(user);
    const { data, error } = await this.db
      .from('tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Ticket not found');
    const ticket = data as Ticket;
    if (user.role === 'estudiante' && ticket.student_id !== user.id)
      throw new ForbiddenException('This ticket belongs to another student');
    return ticket;
  }
  async messages(user: AuthenticatedUser, id: string) {
    const ticket = await this.ticket(user, id);
    this.assertParticipant(user, ticket);
    if (ticket.status === 'closed') return [];
    return this.allPages((from, to) =>
      this.db
        .from('messages')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  private assertParticipant(user: AuthenticatedUser, ticket: Ticket) {
    if (user.role === 'soporte' && ticket.assigned_to !== user.id)
      throw new ForbiddenException(
        'Claim the ticket before accessing its conversation',
      );
  }
  async send(user: AuthenticatedUser, id: string, body: string) {
    const ticket = await this.ticket(user, id);
    this.assertParticipant(user, ticket);
    if (ticket.status === 'closed')
      throw new BadRequestException('Ticket is closed');
    return this.rpc('send_message', {
      p_ticket_id: id,
      p_actor_id: user.id,
      p_body: body.trim(),
    });
  }
  async claim(user: AuthenticatedUser, id: string) {
    await this.ticket(user, id);
    if (user.role !== 'soporte')
      throw new ForbiddenException('Support access required');
    return this.rpc('claim_ticket', { p_ticket_id: id, p_actor_id: user.id });
  }
  async close(user: AuthenticatedUser, id: string) {
    const ticket = await this.ticket(user, id);
    if (user.role !== 'soporte')
      throw new ForbiddenException('Support access required');
    this.assertParticipant(user, ticket);
    return this.rpc('close_ticket', { p_ticket_id: id, p_actor_id: user.id });
  }
  private async rpc(name: string, args: Record<string, string>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      if (error.code === '42501') throw new ForbiddenException(error.message);
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    return data;
  }
}
