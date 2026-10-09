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
 * SÉCURITÉ : la colonne `token` ne contient JAMAIS de JWT exploitable, mais
 * l'empreinte SHA-256 hexadécimale (64 caractères) du jeton, calculée par
 * `TokenBlacklistService.hashToken()` — même approche que
 * `UserActivationToken.tokenHash`. Une lecture de la base (dump SQL, backup,
 * réplication) ne permet donc plus de rejouer un token.
 *
 * Le nom de colonne `token` est délibérément conservé (cf. migration
 * `1763000000000-HashBlacklistedTokens`) : il désigne l'identifiant du token
 * blacklisté, pas le token lui-même. Le schéma n'est pas modifié.
 *
 * Seule exception, non exploitable : les sentinelles
 * `global-invalidation:<userId>:<timestamp>` écrites par
 * `invalidateAllForUser()` (à remplacer par un `tokenVersion`, cf.
 * TODO(AUDIT-004)) — ce ne sont pas des jetons et elles ne correspondent à
 * aucun hash.
 *
 * Aligné sur le pattern efarmOS (TokenBlacklist + blacklist rotation).
 */
@Entity('token_blacklist')
export class TokenBlacklist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Empreinte SHA-256 hexadécimale (64 caractères) du JWT blacklisté,
   * jamais le JWT en clair.
   */
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
