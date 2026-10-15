import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateVideoDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}
