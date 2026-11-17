import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class ModuleInputDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsInt() @Min(0) position!: number;
}
export class LessonInputDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(2000, { message: 'El resumen admite hasta 2.000 caracteres. Usa Texto de la lección para el contenido completo.' }) summary?: string;
  @IsOptional() @IsString() @MaxLength(100000) content?: string;
  @IsInt() @Min(0) position!: number;
  @IsInt() @Min(0) @Max(1440) durationMinutes!: number;
  @IsBoolean() isPublished!: boolean;
  @IsOptional() @IsUUID() videoId?: string | null;
}
export class ResourceLinkDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(['download', 'complementary']) kind!: string;
  @IsIn([
    'document',
    'spreadsheet',
    'presentation',
    'image',
    'archive',
    'link',
    'audio',
    'other',
  ])
  resourceType!: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  externalUrl!: string;
  @IsBoolean() isPublished!: boolean;
}
export class ResourceStateDto {
  @IsBoolean() isPublished!: boolean;
}
export class AccessInputDto {
  @IsIn(['full', 'content', 'live']) accessType!: 'full' | 'content' | 'live';
  @IsIn(['active', 'suspended']) status!: string;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}
export class GrantAccessDto extends AccessInputDto {
  @IsUUID() courseId!: string;
  @IsUUID() studentId!: string;
}
export class ListAccessDto {
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) page?: number;
}

export class MentorProfileDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsString() @MaxLength(160) company!: string;
  @IsString() @MaxLength(2000) bio!: string;
  @IsString() @MaxLength(2048) @ValidateIf((_, value) => value !== '') @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) linkedin!: string;
  @IsString() @MaxLength(2048) @ValidateIf((_, value) => value !== '') @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) website!: string;
}
