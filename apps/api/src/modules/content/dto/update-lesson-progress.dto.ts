import { IsBoolean } from 'class-validator';

export class UpdateLessonProgressDto {
  @IsBoolean()
  completed!: boolean;
}
