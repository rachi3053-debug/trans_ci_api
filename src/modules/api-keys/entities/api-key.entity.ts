import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Index()
  @Column({ type: 'varchar', name: 'key_prefix' })
  keyPrefix!: string;

  @Column({ type: 'text', name: 'key_hash' })
  keyHash!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}
