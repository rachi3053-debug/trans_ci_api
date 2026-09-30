import { Entity, Column, Index } from 'typeorm';
import { BaseAuditEntity } from '../../../common/entities/base-audit.entity';

@Entity('permissions')
@Index(['code', 'tenantId'], { unique: true, where: '"tenant_id" IS NOT NULL' })
export class Permission extends BaseAuditEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Index()
  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar' })
  libelle!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'varchar' })
  module!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;
}
