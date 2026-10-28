import { IsOptional, Matches } from 'class-validator';
export class UpdateJoinLinkDto {
  @IsOptional()
  @Matches(/^https:\/\/(?:[a-z0-9-]+\.)*zoom\.(?:us|com)(?::443)?\//i, {
    message: 'Usa un enlace HTTPS de Zoom valido',
  })
  joinUrl?: string | null;
}
