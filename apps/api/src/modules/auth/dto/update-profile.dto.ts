import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(120) fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsUrl({ require_protocol: true }, { message: 'linkedin must be a valid URL' }) linkedin?: string;
  @IsOptional() @IsUrl({ require_protocol: true }, { message: 'website must be a valid URL' }) website?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsUrl({ require_protocol: true }, { message: 'avatarUrl must be a valid URL' }) avatarUrl?: string;
}
