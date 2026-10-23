import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLessonQuestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;
}
