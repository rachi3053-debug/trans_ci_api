import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entité Tenant - Multi-tenancy à la efarmOS.
 * Chaque tenant représente une organisation/entreprise isolée.
 * Les données sont filtrées automatiquement par tenantId via TenantGuard.
 *
 * Note : les colonnes d'audit sont définies explicitement (pas d'héritage)
 * pour éviter des problèmes de résolution de type TypeORM avec les entités abstraites.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  nom!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true, nullable: true })
  subdomain!: string | null;

  @Column({ type: 'varchar', nullable: true })
  domain!: string | null;

  @Column({ type: 'varchar', nullable: true })
  logo!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  settings!: Record<string, unknown> | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'int', name: 'max_users', default: 50 })
  maxUsers!: number;

  @Column({ type: 'varchar', name: 'subscription_plan', nullable: true })
  subscriptionPlan!: string | null;

  @Column({
    type: 'timestamp',
    name: 'subscription_expires_at',
    nullable: true,
  })
  subscriptionExpiresAt!: Date | null;

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
