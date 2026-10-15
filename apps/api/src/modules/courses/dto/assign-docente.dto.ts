import { IsUUID } from 'class-validator';

export class AssignDocenteDto {
  @IsUUID()
  docenteId!: string;
}
