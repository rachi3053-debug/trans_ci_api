import { Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { BaseSearchFilterDto } from '../dto/base-search-filter.dto';
import { PaginationService } from './pagination.service';
import { PaginatedResponseDto } from '../responses/paginated-response.dto';

/**
 * Options de recherche.
 * - withDeleted : inclut les enregistrements soft-deleted
 * - onlyDeleted : ne renvoie QUE les enregistrements soft-deleted
 * - scope : callback pour ajouter des filtres supplémentaires au QueryBuilder
 */
export interface SearchOptions<T extends ObjectLiteral> {
  withDeleted?: boolean;
  onlyDeleted?: boolean;
  scope?: (qb: SelectQueryBuilder<T>) => void;
}

/**
 * Service générique de recherche plein texte + pagination.
 * Remplace les découpes "méthodes par entité" par une logique commune :
 * - filtrage deletedAt (activé / supprimé / corbeille)
 * - recherche ILIKE multi-champs
 * - délégation de la pagination à PaginationService (meta + links)
 */
@Injectable()
export class SearchService {
  constructor(private readonly paginationService: PaginationService) {}

  /**
   * Recherche paginée générique.
   *
   * @param repository - Repository TypeORM de l'entité cible
   * @param filter - Filtres de pagination + search
   * @param fields - Propriétés de l'entité à chercher (ex: ['nom', 'prenom'])
   * @param baseUrl - URL de base pour les liens HATEOAS
   * @param alias - Alias SQL (défaut 'entity')
   * @param options - Options de soft delete + scope spécifique
   */
  async searchAndPaginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    filter: BaseSearchFilterDto,
    fields: string[],
    baseUrl: string,
    alias = 'entity',
    options: SearchOptions<T> = {},
  ): Promise<PaginatedResponseDto<T>> {
    const qb = repository.createQueryBuilder(alias);

    if (options.onlyDeleted) {
      qb.withDeleted().andWhere(`${alias}.deletedAt IS NOT NULL`);
    } else if (options.withDeleted) {
      qb.withDeleted();
    } else {
      qb.where(`${alias}.deletedAt IS NULL`);
    }

    options.scope?.(qb);

    this.applySearch(qb, fields, filter.search);

    return this.paginationService.paginate(qb, filter, baseUrl);
  }

  /**
   * Applique une recherche textuelle (ILIKE) sur les champs fournis.
   * Les propriétés d'entité sont utilisées telles quelles par le QueryBuilder.
   */
  applySearch<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    fields: string[],
    search?: string,
  ): void {
    const term = search?.trim();
    if (!term || fields.length === 0) return;

    const conditions = fields
      .map((field) => `${qb.alias}.${field} ILIKE :search`)
      .join(' OR ');
    qb.andWhere(`(${conditions})`, { search: `%${term}%` });
  }
}
