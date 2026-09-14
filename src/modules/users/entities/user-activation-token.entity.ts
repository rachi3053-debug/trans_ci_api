import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Finalité d'un jeton d'émission par email :
 * - ACTIVATION : activation d'un compte invité (lien /auth/activate)
 * - RESET : réinitialisation d'un mot de passe oublié (lien /auth/reset-password)
 */
export enum AuthTokenPurpose {
  ACTIVATION = 'ACTIVATION',
  RESET = 'RESET',
}

/**
 * Jeton à usage unique émis par email.
 *
 * SÉCURITÉ : seul le SHA-256 du jeton (64 caractères hexadécimaux) est stocké
 * en base. Le jeton brut n'apparaît que dans l'email envoyé à l'utilisateur
 * et n'est JAMAIS écrit en base ni journalisé.
 *
 * Un seul jeton actif par utilisateur et par finalité : toute (ré)émission
 * revoque les jetons précédents encore en attente.
 */
@Entity('user_activation_tokens')
export class UserActivationToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    name: 'purpose',
    default: AuthTokenPurpose.ACTIVATION,
  })
  purpose!: AuthTokenPurpose;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string;

  @Index()
  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', name: 'used_at', nullable: true })
  usedAt!: Date | null;

  @Column({ type: 'varchar', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
