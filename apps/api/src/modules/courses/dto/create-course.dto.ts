import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
