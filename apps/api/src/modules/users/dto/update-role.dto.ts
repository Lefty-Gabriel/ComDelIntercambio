import { IsIn } from 'class-validator';
import type { Role } from '../../auth/auth.types.js';

export class UpdateRoleDto {
  @IsIn(['alumno', 'docente', 'admin'])
  role!: Role;
}
