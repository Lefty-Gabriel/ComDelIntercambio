import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateUserDto {
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
}
