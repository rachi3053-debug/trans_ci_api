import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

/**
 * Entité de base pour toutes les entités métier.
 * Fournit automatiquement :
 * - id (UUID)
 * - createdAt / updatedAt (timestamps automatiques)
 * - deletedAt (soft delete)
 * - createdBy / updatedBy / deletedBy (traçabilité)
 */
export abstract class BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'varchar', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'varchar', name: 'updated_by', nullable: true })
  updatedBy!: string | null;

  @Column({ type: 'varchar', name: 'deleted_by', nullable: true })
  deletedBy!: string | null;
}
