import { IsIn } from 'class-validator';
export class TicketStatusDto {
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status!: 'open' | 'in_progress' | 'resolved' | 'closed';
}
