import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '../../auth/auth.types.js';
import { ROLES } from '../../auth/auth.types.js';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsIn(ROLES) role!: Role;
  @IsOptional() @IsString() company?: string;
}
