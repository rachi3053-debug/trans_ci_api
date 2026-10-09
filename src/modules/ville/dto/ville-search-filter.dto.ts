import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseSearchFilterDto } from '../../../common/dto/base-search-filter.dto';

/**
 * Filtres de recherche des villes.
 *
 * Le texte libre (`search`, hérité de `BaseSearchFilterDto`) porte sur
 * `nom`, `code`, `region` et `departement` (voir `VilleService.SEARCH_FIELDS`).
 *
 * `region` et `departement` sont aussi des filtres d'égalité afin de permettre
 * un filtrage strict par division administrative, indépendant de la recherche
 * plein texte.
 */
export class VilleSearchFilterDto extends BaseSearchFilterDto {
  @ApiPropertyOptional({ example: 'Région des Lagunes' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: "Département d'Abidjan" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departement?: string;

  @ApiPropertyOptional({
    example: true,
    description: "Filtre le statut d'activation (indépendant du soft delete).",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  actif?: boolean;
}
