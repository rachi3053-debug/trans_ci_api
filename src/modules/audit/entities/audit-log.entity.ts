import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Actions audit possibles, alignées sur le pattern efarmOS.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  BULK_CREATE = 'BULK_CREATE',
  BULK_UPDATE = 'BULK_UPDATE',
  BULK_DELETE = 'BULK_DELETE',
  SEARCH = 'SEARCH',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  USER_INVITATION_SENT = 'USER_INVITATION_SENT',
  USER_INVITATION_RESENT = 'USER_INVITATION_RESENT',
  USER_ACCOUNT_ACTIVATED = 'USER_ACCOUNT_ACTIVATED',
  ACTIVATION_VALIDATED = 'ACTIVATION_VALIDATED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
}

/**
 * Table d'audit dédiée pour la traçabilité complète des actions.
 * Chaque opération significative est enregistrée ici avec :
 * - qui a fait l'action (userId, userEmail)
 * - quoi (entityType, entityId, action)
 * - quand (createdAt)
 * - d'où (ip, userAgent)
 * - détails optionnels (description, metadata)
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', name: 'user_email', nullable: true })
  userEmail!: string | null;

  @Index()
  @Column({ type: 'varchar', name: 'entity_type' })
  entityType!: string;

  @Index()
  @Column({ type: 'varchar', name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Index()
  @Column({ type: 'varchar', name: 'action' })
  action!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
