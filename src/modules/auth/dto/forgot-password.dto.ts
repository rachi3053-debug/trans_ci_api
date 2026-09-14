import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email du compte à réinitialiser' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
