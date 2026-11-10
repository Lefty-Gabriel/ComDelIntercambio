import { ArrayMaxSize, ArrayUnique, IsArray, IsString, Length, Matches } from 'class-validator';
export class TicketLabelsDto {
  @IsArray() @ArrayMaxSize(5) @ArrayUnique()
  @IsString({ each: true }) @Length(1, 32, { each: true })
  @Matches(/\S/, { each: true })
  labels!: string[];
}
