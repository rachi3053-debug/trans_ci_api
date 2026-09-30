import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Table de blacklist des tokens JWT.
 * Utilisée pour :
 * - Invalider un refresh token lors du logout
 * - Empêcher la réutilisation d'un refresh token (rotation)
 * - Invalider tous les tokens d'un utilisateur si nécessaire
 *
 * Aligné sur le pattern efarmOS (TokenBlacklist + blacklist rotation).
 */
@Entity('token_blacklist')
export class TokenBlacklist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  token!: string;

  @Index()
  @Column({ type: 'varchar', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', name: 'token_type', default: 'access' })
  tokenType!: 'access' | 'refresh';

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
