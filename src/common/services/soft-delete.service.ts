import { HttpStatus, Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { MessageService } from '../messages/message.service';
import { MessageCode } from '../messages/message.codes';

/**
 * Service générique de soft-delete.
 * Les entités cibles doivent hériter de BaseAuditEntity (deletedAt / deletedBy).
 *
 * Toutes les méthodes sont génériques et fonctionnent sur n'importe quel
 * Repository TypeORM : users, roles, permissions, etc.
 */
@Injectable()
export class SoftDeleteService {
  constructor(private readonly messageService: MessageService) {}

  /**
   * Soft-delete d'un enregistrement (marque deletedAt + deletedBy).
   */
  async softDelete<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    id: string,
    deletedBy: string | null,
  ): Promise<void> {
    const result = await repository.update(id, {
      deletedAt: new Date(),
      deletedBy,
      // Cast nécessaire : les colonnes d'audit ne sont pas déclarées sur le générique T.
    } as unknown as Partial<T>);
    if (!result.affected) {
      this.messageService.throwBusiness(
        MessageCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Soft-delete de plusieurs enregistrements.
   * @returns Le nombre d'enregistrements modifiés
   */
  async softDeleteMany<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    ids: string[],
    deletedBy: string | null,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await repository
      .createQueryBuilder()
      .update()
      .set({ deletedAt: new Date(), deletedBy } as unknown as Partial<T>)
      .whereInIds(ids)
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Restaure un enregistrement supprimé (deletedAt = NULL).
   */
  async restore<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    id: string,
  ): Promise<void> {
    const result = await repository.update(id, {
      deletedAt: null,
      deletedBy: null,
      // Cast nécessaire : les colonnes d'audit ne sont pas déclarées sur le générique T.
    } as unknown as Partial<T>);
    if (!result.affected) {
      this.messageService.throwBusiness(
        MessageCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Restaure plusieurs enregistrements.
   */
  async restoreMany<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    ids: string[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await repository
      .createQueryBuilder()
      .update()
      .set({ deletedAt: null, deletedBy: null } as unknown as Partial<T>)
      .whereInIds(ids)
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Suppression physique définitive (irréversible).
   */
  async hardDelete<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    id: string,
  ): Promise<void> {
    const result = await repository.delete(id);
    if (!result.affected) {
      this.messageService.throwBusiness(
        MessageCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Récupère un enregistrement même s'il est supprimé (soft).
   */
  async findWithDeleted<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    id: string,
  ): Promise<T | null> {
    return repository.findOne({ where: { id } as never, withDeleted: true });
  }

  /**
   * Indique si un enregistrement est supprimé (soft) en base.
   */
  async hasDeleted<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    id: string,
  ): Promise<boolean> {
    const row = await repository.findOne({
      where: { id } as never,
      withDeleted: true,
      select: ['id'] as (keyof T)[],
    });
    return row !== null;
  }
}
