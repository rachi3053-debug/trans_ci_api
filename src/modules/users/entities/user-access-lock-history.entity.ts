import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Actions possibles sur un compte (verrouillage).
 */
export enum AccessLockAction {
  LOCK = 'lock',
  UNLOCK = 'unlock',
}

/**
 * Historique des blocages / déblocages d'un compte utilisateur.
 * Chaque action est tracée : qui, quand, pourquoi.
 */
@Entity('user_access_lock_history')
export class UserAccessLockHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Index()
  @Column({ type: 'varchar' })
  action!: AccessLockAction;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', name: 'performed_by', nullable: true })
  performedBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
