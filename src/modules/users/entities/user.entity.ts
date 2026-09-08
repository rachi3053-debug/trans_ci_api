import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  nom!: string;

  @Column({ type: 'varchar' })
  prenom!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  telephone!: string;

  @Column({ type: 'varchar', name: 'password' })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;

  @Column({ type: 'boolean', name: 'email_verified', default: false })
  emailVerified!: boolean;

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
