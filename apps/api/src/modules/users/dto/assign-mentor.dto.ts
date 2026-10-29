import { IsUUID } from 'class-validator';
export class AssignMentorDto {
  @IsUUID()
  mentorId!: string;
}
