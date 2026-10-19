import { IsIn } from 'class-validator';
import type { Role } from '../../auth/auth.types.js';
import { ROLES } from '../../auth/auth.types.js';

export class UpdateRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
