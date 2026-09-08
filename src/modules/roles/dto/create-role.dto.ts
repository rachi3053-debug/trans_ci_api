import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'ADMIN' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Administrateur' })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiPropertyOptional({ example: 'Accès total au système' })
  @IsOptional()
  @IsString()
  description?: string;
}
