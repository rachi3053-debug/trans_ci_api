import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { User, UserStatus } from '../users/entities/user.entity';
import {
  UserActivationToken,
  AuthTokenPurpose,
} from '../users/entities/user-activation-token.entity';
import { EmailService } from '../mail/email.service';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { PasswordService } from '../../common/services/password.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { TenantContextService } from '../tenants/tenant-context.service';

export interface ActivationValidationResult {
  valid: boolean;
  email?: string;
  expiresAt?: Date;
}

export interface ActivationTokenIssue {
  rawToken: string;
  expiresAt: Date;
}

/**
 * Gestion de l'invitation et de l'activation des comptes.
 *
 * SÉCURITÉ :
 * - Jeton généré via `crypto.randomBytes` (32 octets aléatoires).
 * - Seul le SHA-256 du jeton est persisté (`token_hash`). Le jeton brut
 *   ne transite que par l'email d'invitation.
 * - Aucun mot de passe ni token brut ne sont écrits dans les journaux/audit.
 * - Un seul jeton actif par utilisateur : toute (ré)émission le révoque.
 */
@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(
    @InjectRepository(UserActivationToken)
    private tokenRepo: Repository<UserActivationToken>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly messageService: MessageService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get expiresInHours(): number {
    return this.config.get<number>('USER_INVITATION_EXPIRES_IN_HOURS', 24);
  }

  private get resendCooldownSeconds(): number {
    return this.config.get<number>(
      'USER_INVITATION_RESEND_COOLDOWN_SECONDS',
      60,
    );
  }

  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

  /**
   * SHA-256 du jeton brut (jamais stocké réversiblement).
   */
  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Crée un jeton à usage unique pour l'utilisateur (dans une transaction si un
   * EntityManager est fourni) et révoque tout jeton précédent de la même
   * finalité encore en attente. Retourne le jeton BRUT pour envoi par email
   * après commit.
   */
  async issueToken(
    userId: string,
    purpose: AuthTokenPurpose,
    manager?: EntityManager,
  ): Promise<ActivationTokenIssue> {
    const tokenRepo = manager
      ? manager.getRepository(UserActivationToken)
      : this.tokenRepo;

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.expiresInHours * 3600 * 1000);

    // Un seul jeton actif par utilisateur et par finalité : on révoque les
    // jetons de même finalité encore en attente.
    await tokenRepo
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('purpose = :purpose', { purpose })
      .andWhere('used_at IS NULL')
      .execute();

    await tokenRepo.save(
      tokenRepo.create({
        userId,
        purpose,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        createdBy: this.tenantContext.userId,
      }),
    );

    return { rawToken, expiresAt };
  }

  /**
   * Jeton d'activation d'un compte invité (finalité ACTIVATION).
   */
  async issueActivationToken(
    userId: string,
    manager?: EntityManager,
  ): Promise<ActivationTokenIssue> {
    return this.issueToken(userId, AuthTokenPurpose.ACTIVATION, manager);
  }

  /**
   * Envoie l'email d'invitation (déclenché APRÈS commit de la transaction
   * appelante) et trace l'événement d'audit.
   */
  async sendInvitationEmail(input: {
    to: string;
    recipientName: string;
    rawToken: string;
    expiresAt: Date;
    resend?: boolean;
  }): Promise<void> {
    const activationUrl = `${this.frontendUrl}/auth/activate?token=${input.rawToken}`;

    await this.auditService.log({
      userId: this.tenantContext.userId ?? undefined,
      entityType: 'User',
      action: input.resend
        ? AuditAction.USER_INVITATION_RESENT
        : AuditAction.USER_INVITATION_SENT,
      description: `${input.resend ? 'Renvoi ' : ''}Invitation envoyée à ${input.to}`,
      metadata: { expiresAt: input.expiresAt.toISOString() },
    });

    await this.emailService.sendInvitation({
      to: input.to,
      recipientName: input.recipientName,
      activationUrl,
      expiresAt: input.expiresAt,
      resend: input.resend,
    });
  }

  /**
   * Valide un jeton d'activation sans le consommer.
   */
  async validateToken(rawToken: string): Promise<ActivationValidationResult> {
    const token = await this.findPendingToken(
      rawToken,
      AuthTokenPurpose.ACTIVATION,
    );
    if (!token) {
      return { valid: false };
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      return { valid: false };
    }
    const user = await this.userRepo.findOneBy({ id: token.userId });
    if (!user || user.status !== UserStatus.INVITED) {
      return { valid: false };
    }
    return {
      valid: true,
      email: user.email,
      expiresAt: token.expiresAt,
    };
  }

  /**
   * Active le compte : vérifie le jeton (non consommé, non expiré), le marque
   * consommé de façon atomique, définit le mot de passe (Argon2id) et passe
   * l'utilisateur en statut ACTIVE.
   */
  async activate(rawToken: string, password: string): Promise<User> {
    const token = await this.findPendingToken(
      rawToken,
      AuthTokenPurpose.ACTIVATION,
    );
    if (!token) {
      this.messageService.throwBusiness(
        MessageCode.INVITATION_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const expired = token.expiresAt.getTime() <= Date.now();
    if (expired) {
      // Consomme le jeton expiré pour empêcher tout usage ultérieur.
      await this.markUsed(token);
      this.messageService.throwBusiness(
        MessageCode.INVITATION_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userRepo.findOneBy({ id: token.userId });
    if (!user || user.status !== UserStatus.INVITED) {
      this.messageService.throwBusiness(
        MessageCode.INVITATION_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Consommation atomique du jeton (sécurité anti rejeu).
    const consumed = await this.tokenRepo
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('id = :id', { id: token.id })
      .andWhere('used_at IS NULL')
      .returning('id')
      .execute();
    if (!consumed.raw.length) {
      this.messageService.throwBusiness(
        MessageCode.INVITATION_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await this.passwordService.hash(password);
    user.passwordHash = passwordHash;
    user.status = UserStatus.ACTIVE;
    user.actif = true;
    user.emailVerified = true;
    user.firstConnexion = true;
    user.updatedBy = user.id;
    await this.userRepo.save(user);

    // Révoque tout autre jeton d'activation encore en attente pour ce compte.
    await this.revokePending(user.id, AuthTokenPurpose.ACTIVATION);

    await this.auditService.log({
      userId: user.id,
      userEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.USER_ACCOUNT_ACTIVATED,
      description: `Compte activé par ${user.email}`,
      metadata: { expiresAt: token.expiresAt.toISOString() },
    });

    return user;
  }

  /**
   * Renvoi d'invitation : respecte un cooldown entre deux envois et révoque
   * les jetons précédents.
   */
  async resendInvitation(user: User): Promise<void> {
    const lastToken = await this.tokenRepo.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
    if (
      lastToken &&
      lastToken.createdAt.getTime() > this.invalidationWindow()
    ) {
      this.messageService.throwBusiness(
        MessageCode.INVITATION_TOO_FRESH,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { rawToken, expiresAt } = await this.issueActivationToken(user.id);
    await this.sendInvitationEmail({
      to: user.email,
      recipientName: `${user.prenom} ${user.nom}`.trim(),
      rawToken,
      expiresAt,
      resend: true,
    });
  }

  private invalidationWindow(): number {
    return Date.now() - this.resendCooldownSeconds * 1000;
  }

  private async findPendingToken(
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<UserActivationToken | null> {
    return this.tokenRepo
      .createQueryBuilder('t')
      .where('t.tokenHash = :hash', { hash: this.hashToken(rawToken) })
      .andWhere('t.purpose = :purpose', { purpose })
      .andWhere('t.usedAt IS NULL')
      .getOne();
  }

  private async revokePending(
    userId: string,
    purpose: AuthTokenPurpose,
  ): Promise<void> {
    await this.tokenRepo
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('purpose = :purpose', { purpose })
      .andWhere('used_at IS NULL')
      .execute();
  }

  private async markUsed(token: UserActivationToken): Promise<void> {
    await this.tokenRepo.update({ id: token.id }, { usedAt: new Date() });
  }

  // ---------------------------------------------------------------------------
  // Mot de passe oublié (réinitialisation par email)
  // ---------------------------------------------------------------------------

  /**
   * Émet un jeton RESET et envoie l'email de réinitialisation. Si aucun compte
   * éligible n'existe (email inconnu ou statut non réinitialisable), ne fait
   * rien : la réponse reste neutre pour ne pas révéler l'existence des comptes.
   */
  async requestPasswordReset(user: User): Promise<ActivationTokenIssue> {
    const { rawToken, expiresAt } = await this.issueToken(
      user.id,
      AuthTokenPurpose.RESET,
    );

    const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${rawToken}`;

    await this.auditService.log({
      userId: user.id,
      userEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      description: `Réinitialisation du mot de passe demandée pour ${user.email}`,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    await this.emailService.sendPasswordReset({
      to: user.email,
      recipientName: `${user.prenom} ${user.nom}`.trim(),
      resetUrl,
      expiresAt,
    });

    return { rawToken, expiresAt };
  }

  /**
   * Finalise la réinitialisation : vérifie le jeton RESET (valide, non expiré),
   * le consomme de façon atomique et remplace le mot de passe (Argon2id).
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<User> {
    const token = await this.findPendingToken(rawToken, AuthTokenPurpose.RESET);
    if (!token) {
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_RESET_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      await this.markUsed(token);
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_RESET_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userRepo.findOneBy({ id: token.userId });
    if (!user || user.status !== UserStatus.ACTIVE) {
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_RESET_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Consommation atomique du jeton (anti-rejeu).
    const consumed = await this.tokenRepo
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('id = :id', { id: token.id })
      .andWhere('used_at IS NULL')
      .returning('id')
      .execute();
    if (!consumed.raw.length) {
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_RESET_INVALID_OR_EXPIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    user.passwordHash = await this.passwordService.hash(newPassword);
    user.updatedBy = user.id;
    await this.userRepo.save(user);

    // Révoque tout autre jeton RESET encore en attente pour ce compte.
    await this.revokePending(user.id, AuthTokenPurpose.RESET);

    await this.auditService.log({
      userId: user.id,
      userEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      description: `Mot de passe réinitialisé pour ${user.email}`,
      metadata: { expiresAt: token.expiresAt.toISOString() },
    });

    return user;
  }
}
