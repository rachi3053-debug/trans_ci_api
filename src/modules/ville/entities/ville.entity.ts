import { Entity, Column, Index } from 'typeorm';
import { BaseAuditEntity } from '../../../common/entities/base-audit.entity';

@Entity('villes')
export class Ville extends BaseAuditEntity {

  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Index()
  @Column({ type: 'varchar' })
  nom!: string;

  @Index()
  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', nullable: true })
  departement!: string | null;

  @Column({ type: 'varchar', name: 'code_postal', nullable: true })
  codePostal!: string | null;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;
}
