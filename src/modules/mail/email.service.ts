import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { buildInvitationHtml } from './templates/invitation.template';
import { buildPasswordResetHtml } from './templates/password-reset.template';

export interface InvitationMailInput {
  to: string;
  recipientName: string;
  activationUrl: string;
  expiresAt: Date;
  resend?: boolean;
}

export interface PasswordResetMailInput {
  to: string;
  recipientName: string;
  resetUrl: string;
  expiresAt: Date;
}

/**
 * Service d'envoi d'emails.
 *
 * - Si les variables SMTP (MAIL_HOST, MAIL_USER, MAIL_PASSWORD...) sont
 *   configurées, un transport Nodemailer est utilisé.
 * - Sinon (environnement de développement), l'email est simulé : le lien
 *   d'activation est loggé en clair en console pour permettre la recette.
 *   En aucun cas le lien n'est écrit en base ni dans les journaux d'audit.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly enabledByDefault: boolean;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('MAIL_HOST', '');
    const port = this.config.get<number>('MAIL_PORT', 587);
    const user = this.config.get<string>('MAIL_USER', '');
    const pass = this.config.get<string>('MAIL_PASSWORD', '');
    this.from = this.config.get<string>(
      'MAIL_FROM',
      'TransCI <no-reply@transci-ci.com>',
    );
    this.enabledByDefault =
      this.config.get<string>('MAIL_SEND_ENABLED', String(!!host && !!user)) ===
      'true';

    this.transporter =
      host && user
        ? nodemailer.createTransport({
            host,
            port,
            secure: this.config.get<string>('MAIL_SECURE', 'false') === 'true',
            auth: user ? { user, pass } : undefined,
          })
        : null;
  }

  async sendInvitation(input: InvitationMailInput): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.resend
          ? 'TransCI – Nouvelle invitation'
          : 'TransCI – Invitation à activer votre compte',
        html: buildInvitationHtml({
          recipientName: input.recipientName,
          activationUrl: input.activationUrl,
          expiresAt: input.expiresAt,
          resend: input.resend,
        }),
      });
      this.logger.log(`Invitation envoyée à ${input.to}`);
      return;
    }

    if (this.enabledByDefault) {
      // Mode "dry-run" : on journalise uniquement en dev, jamais de token brut
      // écrit en base ni dans les logs applicatifs persistants.
      this.logger.warn(
        `[EMAIL SIMULÉ] Invitation ${input.resend ? '(renvoi) ' : ''}pour ${
          input.to
        } : ${input.activationUrl}`,
      );
      return;
    }

    this.logger.warn(
      `Envoi d'email non configuré (MAIL_HOST/MAIL_USER absents). Invitation pour ${input.to} non envoyée.`,
    );
  }

  async sendPasswordReset(input: PasswordResetMailInput): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: 'TransCI – Réinitialisation de votre mot de passe',
        html: buildPasswordResetHtml({
          recipientName: input.recipientName,
          resetUrl: input.resetUrl,
          expiresAt: input.expiresAt,
        }),
      });
      this.logger.log(`Lien de réinitialisation envoyé à ${input.to}`);
      return;
    }

    if (this.enabledByDefault) {
      this.logger.warn(
        `[EMAIL SIMULÉ] Réinitialisation de mot de passe pour ${input.to} : ${input.resetUrl}`,
      );
      return;
    }

    this.logger.warn(
      `Envoi d'email non configuré (MAIL_HOST/MAIL_USER absents). Réinitialisation pour ${input.to} non envoyée.`,
    );
  }
}
