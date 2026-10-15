import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CompleteVideoDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
