import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLiveSessionDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  @MinLength(3)
  title!: string;
}
