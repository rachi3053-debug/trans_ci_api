import { Entity, Column, Index } from 'typeorm';
import { BaseAuditEntity } from '../../../common/entities/base-audit.entity';

/**
 * Cycle de vie d'un compte utilisateur.
 * - INVITED : créé par un admin, pas encore activé (invitation par email en attente)
 * - ACTIVE  : compte opérationnel (actif = true)
 * - SUSPENDED / DISABLED : comptes inactifs via les mécanismes existants (actif = false)
 */
export enum UserStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

@Entity('users')
@Index(['email', 'tenantId'], {
  unique: true,
  where: '"tenant_id" IS NOT NULL',
})
export class User extends BaseAuditEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar' })
  nom!: string;

  @Column({ type: 'varchar' })
  prenom!: string;

  @Index()
  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  telephone!: string;

  /**
   * Hash du mot de passe (Argon2id pour les nouveaux comptes, bcrypt pour les
   * comptes hérités). NULL tant que l'utilisateur n'a pas activé son compte.
   */
  @Column({ type: 'varchar', name: 'password', nullable: true })
  passwordHash!: string | null;

  /**
   * Statut du cycle de vie du compte (INVITED tant que l'invitation n'est pas
   * activée). Les comptes pré-existants restent ACTIVE.
   */
  @Column({
    type: 'varchar',
    length: 20,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({ type: 'boolean', default: true })
  actif!: boolean;

  @Column({ type: 'boolean', name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ type: 'boolean', name: 'access_locked', default: false })
  accessLocked!: boolean;

  @Column({ type: 'timestamp', name: 'locked_at', nullable: true })
  lockedAt!: Date | null;

  @Column({ type: 'varchar', name: 'locked_by', nullable: true })
  lockedBy!: string | null;

  @Column({ type: 'text', name: 'lock_reason', nullable: true })
  lockReason!: string | null;

  @Column({ type: 'boolean', name: 'first_connexion', default: false })
  firstConnexion!: boolean;

  /** Chemin du fichier avatar dans Supabase Storage (bucket `avatars`). */
  @Column({ type: 'varchar', name: 'avatar_path', nullable: true })
  avatarPath!: string | null;
}
