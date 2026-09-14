import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';

/**
 * DTO de base pour les recherches paginées.
 * Ajoute un champ `search` (recherche plein texte) aux paramètres de pagination.
 * Le tri est déjà géré par PaginationDto (sortBy / sortOrder).
 */
export class BaseSearchFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Texte de recherche (appliqué sur les champs configurés)',
    example: 'jean',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
