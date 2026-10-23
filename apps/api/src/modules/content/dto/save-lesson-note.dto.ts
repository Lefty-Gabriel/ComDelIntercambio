import { IsString, MaxLength } from 'class-validator';

export class SaveLessonNoteDto {
  @IsString()
  @MaxLength(20000)
  content!: string;
}
