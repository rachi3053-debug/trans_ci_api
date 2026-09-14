import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  ArrayNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';

/**
 * DTO générique pour les opérations en masse par liste d'ids.
 */
export class BulkByIdsDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Assignation de rôles en masse.
 */
export class BulkAssignRolesDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ example: ['ADMIN', 'OPERATEUR'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes!: string[];
}

/**
 * Suppression logique en masse. `confirm` est obligatoire (anti-erreur).
 */
export class BulkDeleteDto extends BulkByIdsDto {
  @ApiProperty({
    example: true,
    description: 'Confirmation explicite de la suppression en masse',
  })
  @IsBoolean()
  confirm!: boolean;
}

/**
 * Changement de statut (actif/inactif) en masse.
 */
export class BulkToggleStatusDto extends BulkByIdsDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  actif!: boolean;
}

/**
 * Résultat standard d'une opération en masse.
 */
export class BulkOperationResultDto {
  readonly total: number;
  readonly successCount: number;
  readonly failedIds: string[];
  readonly message?: string;

  constructor(
    total: number,
    successCount: number,
    failedIds: string[],
    message: string,
  ) {
    this.total = total;
    this.successCount = successCount;
    this.failedIds = failedIds;
    this.message = message;
  }
}

/**
 * Filtre optionnel pour les opérations en masse (réservation).
 */
export class BulkOperationFilterDto {
  @ApiPropertyOptional({
    description: 'Ne traiter que les ids existants (auto-préventif)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  validateIds?: boolean = true;
}
