import {
  IsBoolean,
  IsUUID,
  IsIn,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
export class ForumReplyDto {
  @IsString() @Matches(/\S/) @MaxLength(2000) content!: string;
}
export class ForumThreadDto {
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(4000) content!: string;
  @IsIn(['Ventas B2B', 'Finanzas', 'Casos de Éxito', 'Liderazgo'])
  category!: string;
}
export class ForumLikeDto {
  @IsBoolean() liked!: boolean;
}
export class ChatMessageDto {
  @IsUUID() mentorId!: string;
  @IsString() @Matches(/\S/) @MaxLength(2000) body!: string;
}
