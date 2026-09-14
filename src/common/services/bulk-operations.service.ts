import { HttpStatus, Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral, In } from 'typeorm';
import { MessageService } from '../messages/message.service';
import { MessageCode } from '../messages/message.codes';
import { BulkOperationResultDto } from '../dto/bulk-operations.dto';

/**
 * Service générique pour les opérations en masse.
 * Sécurise les ids (tous doivent exister) et fournit un résultat standardisé.
 */
@Injectable()
export class BulkOperationsService {
  constructor(private readonly messageService: MessageService) {}

  /**
   * Vérifie que tous les ids existent dans le repository.
   * @throws BusinessException (RESOURCE_NOT_FOUND) si au moins un id est inconnu
   */
  async ensureAllExist<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const found = await repository.find({
      where: { id: In(ids) } as never,
      select: ['id'] as (keyof T)[],
    });
    const existingIds = new Set(found.map((row) => row.id));
    const missing = ids.find((id) => !existingIds.has(id));
    if (missing) {
      this.messageService.throwBusiness(
        MessageCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Mise à jour partielle en masse (mêmes valeurs pour tous les ids).
   * @returns Le nombre d'enregistrements modifiés
   */
  async bulkUpdate<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    ids: string[],
    partial: Partial<T>,
    updatedBy: string | null,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await repository
      .createQueryBuilder()
      .update()
      .set({ ...partial, updatedBy })
      .whereInIds(ids)
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Construit le résultat standardisé d'une opération en masse.
   */
  buildResult(
    total: number,
    successCount: number,
    failedIds: string[],
    message: string,
  ): BulkOperationResultDto {
    return new BulkOperationResultDto(total, successCount, failedIds, message);
  }
}
