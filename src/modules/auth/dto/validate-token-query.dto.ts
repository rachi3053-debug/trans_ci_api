import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateTokenQueryDto {
  @ApiProperty({ description: "Jeton d'invitation reçu par email" })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
