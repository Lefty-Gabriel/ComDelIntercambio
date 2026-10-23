import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnswerLessonQuestionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  reply!: string;
}
