import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * Retrait de rôles spécifiques d'un utilisateur.
 */
export class RemoveRolesDto {
  @ApiProperty({ example: ['OPERATEUR', 'CONSULTATION'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes!: string[];
}
