import { Entity, Column, Index } from 'typeorm';
import { BaseAuditEntity } from '../../../common/entities/base-audit.entity';

@Entity('roles')
@Index(['code', 'tenantId'], { unique: true, where: '"tenant_id" IS NOT NULL' })
export class Role extends BaseAuditEntity {
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

  @Column({ type: 'boolean', default: true })
  actif!: boolean;
}
