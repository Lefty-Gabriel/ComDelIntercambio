import { IsEmail } from 'class-validator';
export class EnrollByEmailDto {
  @IsEmail() email!: string;
}
