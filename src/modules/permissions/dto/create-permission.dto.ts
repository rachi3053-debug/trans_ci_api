import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'USER:CREATE' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Créer un utilisateur' })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiPropertyOptional({ example: 'Gestion des utilisateurs' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'USER' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({ example: 'CREATE' })
  @IsString()
  @IsNotEmpty()
  action!: string;
}
