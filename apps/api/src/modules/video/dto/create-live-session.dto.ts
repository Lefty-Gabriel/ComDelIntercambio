import { IsDateString, IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateLiveSessionDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;
}
