import { IsNumber, IsUUID, Max, Min } from 'class-validator';
export class SaveResumeDto {
  @IsUUID() lessonId!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(604800)
  positionSeconds!: number;
}
