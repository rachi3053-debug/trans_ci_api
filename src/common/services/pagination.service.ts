import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder, Repository, ObjectLiteral } from 'typeorm';
import { PaginationDto } from '../dto/pagination.dto';
import { PaginatedResponseDto } from '../responses/paginated-response.dto';

/**
 * Colonnes audit standard présentes sur les entités BaseAuditEntity.
 * Utilisées pour le tri automatique et le filtrage soft-delete.
 */
const AUDIT_COLUMNS = [
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'updatedBy',
  'deletedBy',
];

/**
 * Colonnes interdites au tri côté client (sécurité).
 */
const BLOCKED_SORT_COLUMNS = ['passwordHash', 'password', 'deletedBy'];

@Injectable()
export class PaginationService {
  /**
   * Exécute une requête paginée via un QueryBuilder TypeORM.
   *
   * @param queryBuilder - Le QueryBuilder préparé par le service appelant
   * @param dto - Les paramètres de pagination (page, limit, sortBy, sortOrder)
   * @param baseUrl - L'URL de base pour les liens HATEOAS (ex: '/api/v1/users')
   * @returns PaginatedResponseDto contenant data, meta et links
   */
  async paginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    dto: PaginationDto,
    baseUrl: string,
  ): Promise<PaginatedResponseDto<T>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    // Nettoyage et validation du champ de tri
    const sortColumn = this.sanitizeSortColumn(dto.sortBy ?? 'createdAt');
    const sortOrder = this.sanitizeSortOrder(dto.sortOrder ?? 'DESC');

    // Tri via le QueryBuilder pour garder le contexte de requête
    const alias = queryBuilder.alias;
    queryBuilder.orderBy(`${alias}.${sortColumn}`, sortOrder);
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return new PaginatedResponseDto(data, total, page, limit, baseUrl);
  }

  /**
   * Construit un QueryBuilder paginé directement depuis un Repository.
   * Utile quand le service n'a pas besoin de joins/filtres complexes.
   */
  paginateFromRepository<T extends ObjectLiteral>(
    repository: Repository<T>,
    dto: PaginationDto,
    baseUrl: string,
    aliasName = 'entity',
  ): SelectQueryBuilder<T> {
    const queryBuilder = repository.createQueryBuilder(aliasName);
    return queryBuilder;
  }

  /**
   * Nettoie le champ de tri pour éviter les injections SQL.
   * Autorise uniquement les colonnes alphanumériques et les points (pour les relations).
   */
  private sanitizeSortColumn(sortBy: string): string {
    // Autoriser les lettres, chiffres et points (pour entity.relation.column)
    const sanitized = sortBy.replace(/[^a-zA-Z0-9._]/g, '');

    if (!sanitized || BLOCKED_SORT_COLUMNS.includes(sanitized)) {
      return 'createdAt';
    }

    return sanitized;
  }

  /**
   * Valide et normalise l'ordre de tri.
   */
  private sanitizeSortOrder(sortOrder: string): 'ASC' | 'DESC' {
    const upper = sortOrder.toUpperCase();
    return upper === 'ASC' || upper === 'DESC' ? upper : 'DESC';
  }
}
