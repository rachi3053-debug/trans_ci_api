import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export interface AuditLogEntry {
  userId?: string;
  userEmail?: string;
  entityType: string;
  entityId?: string;
  action: AuditAction;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Service centralisé d'audit.
 * Écrit les traces d'audit en base + loggue via Logger NestJS.
 * Aligné sur le pattern efarmOS (AuditService + AutoAuditInterceptor).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Enregistre une entrée d'audit en base de données.
   */
  async log(entry: AuditLogEntry): Promise<AuditLog> {
    const auditLog = this.auditLogRepo.create({
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      description: entry.description ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    });

    const saved = await this.auditLogRepo.save(auditLog);

    this.logger.log(
      `[AUDIT] ${entry.action} ${entry.entityType}${entry.entityId ? `#${entry.entityId}` : ''} by ${entry.userEmail ?? 'system'}`,
    );

    return saved;
  }

  /**
   * Récupère les logs d'audit pour une entité donnée.
   */
  async findByEntity(
    entityType: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Récupère les logs d'audit pour un utilisateur donné.
   */
  async findByUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
