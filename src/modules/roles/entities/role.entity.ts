import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  libelle!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;

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
