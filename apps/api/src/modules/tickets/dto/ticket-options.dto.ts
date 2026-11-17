import { IsIn, IsString, Length, IsUUID } from 'class-validator';
export class CreateTicketOptionDto {
  @IsIn(['label', 'status']) kind!: 'label' | 'status';
  @IsString() @Length(2, 32) name!: string;
}
export class CustomTicketStatusDto {
  @IsUUID() optionId!: string;
}
