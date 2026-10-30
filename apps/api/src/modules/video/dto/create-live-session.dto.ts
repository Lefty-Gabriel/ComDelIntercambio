import {
  IsOptional,
  Matches,
  IsDateString,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateLiveSessionDto {
  @IsOptional() @IsString() @Matches(/^(?:[0-9\s-]{9,20})?$/)
  meetingId?: string;
  @IsOptional() @IsString() @MaxLength(32)
  meetingPasscode?: string;
  @IsOptional()
  @Matches(/^https:\/\/(?:[a-z0-9-]+\.)*zoom\.(?:us|com)(?::443)?\//i, {
    message: 'Usa un enlace HTTPS de Zoom valido',
  })
  joinUrl?: string;

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
