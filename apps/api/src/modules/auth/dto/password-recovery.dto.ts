import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
export class RecoverPasswordDto {
  @IsEmail() email!: string;
}
export class ResetPasswordDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) challenge?: string;
  @IsString() @MinLength(20) @MaxLength(8192) accessToken!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
