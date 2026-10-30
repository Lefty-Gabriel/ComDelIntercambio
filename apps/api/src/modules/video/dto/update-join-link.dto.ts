import { IsOptional, Matches, IsString, MaxLength } from 'class-validator';
export class UpdateJoinLinkDto {
  @IsOptional() @IsString() @Matches(/^(?:[0-9\s-]{9,20})?$/) meetingId?: string;
  @IsOptional() @IsString() @MaxLength(32) meetingPasscode?: string;
  @IsOptional()
  @Matches(/^https:\/\/(?:[a-z0-9-]+\.)*zoom\.(?:us|com)(?::443)?\//i, {
    message: 'Usa un enlace HTTPS de Zoom valido',
  })
  joinUrl?: string | null;
}
