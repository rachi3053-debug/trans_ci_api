import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MotDePasse123!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
