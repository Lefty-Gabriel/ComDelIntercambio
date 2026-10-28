import { IsUUID, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsUUID() docenteId?: string;
  @IsOptional()
  @IsIn(['course', 'masterclass', 'workshop'])
  contentType?: 'course' | 'masterclass' | 'workshop';

  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
