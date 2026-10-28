import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ReadNotificationsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^(live|video|lesson|resource|announcement):[0-9a-f-]{36}$/i, {
    each: true,
  })
  ids!: string[];
}
export class PublishAnnouncementDto {
  @IsOptional() @IsUUID() courseId?: string;
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsString() @MinLength(3) @MaxLength(2000) body!: string;
  @IsIn(['announcement', 'event']) kind!: 'announcement' | 'event';
  @IsOptional() @IsDateString() expiresAt?: string;
}
