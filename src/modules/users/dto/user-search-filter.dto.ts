import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseSearchFilterDto } from '../../../common/dto/base-search-filter.dto';

/**
 * Filtres de recherche avancée des utilisateurs.
 * - search : texte libre (nom, prénom, email, téléphone)
 * - role : filtre par code de rôle (joindre via EXISTS)
 * - actif : filtre par statut actif/inactif
 */
export class UserSearchFilterDto extends BaseSearchFilterDto {
  @ApiPropertyOptional({
    description: 'Code du rôle à filtrer',
    example: 'ADMIN',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Statut actif/inactif', example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  actif?: boolean;
}
