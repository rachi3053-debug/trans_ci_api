import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { createHash } from 'node:crypto';
import { TokenBlacklist } from './entities/token-blacklist.entity';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @InjectRepository(TokenBlacklist)
    private readonly blacklistRepo: Repository<TokenBlacklist>,
  ) {}

  /**
   * SHA-256 du jeton brut, en hexadécimal (64 caractères).
   *
   * Même approche que `ActivationService.hashToken()` : la base ne contient
   * que l'empreinte du jeton. Une lecture de la base (dump SQL, backup,
   * réplication, accès en lecture seule) ne permet donc plus de rejouer un
   * jeton comme `Bearer` ou sur `POST /auth/refresh`.
   */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Ajoute un token à la blacklist.
   *
   * SÉCURITÉ : le jeton n'est jamais écrit en base, seule son empreinte
   * SHA-256 l'est (cf. `hashToken`).
   *
   * @param token - Le token JWT en clair (uniquement en mémoire)
   * @param expiresAt - Date d'expiration du token (pour le nettoyage automatique)
   * @param userId - ID de l'utilisateur (optionnel)
   * @param tokenType - 'access' ou 'refresh'
   * @param reason - Raison de l'invalidation (logout, rotation, etc.)
   */
  async add(
    token: string,
    expiresAt: Date,
    userId?: string,
    tokenType: 'access' | 'refresh' = 'access',
    reason?: string,
  ): Promise<void> {
    // Idempotence : un même jeton peut être proposé plusieurs fois (logout
    // répété, rotation, etc.). On n'insère qu'une seule ligne afin de ne pas
    // heurter l'index unique `IDX_token_blacklist_token`.
    if (await this.isBlacklisted(token)) {
      // Aucun journal du jeton : seule la trace de l'état est conservée.
      this.logger.debug('Jeton déjà blacklisté : ajout ignoré.');
      return;
    }

    const entry = this.blacklistRepo.create({
      token: this.hashToken(token),
      userId: userId ?? null,
      expiresAt,
      tokenType,
      reason: reason ?? null,
    });
    await this.blacklistRepo.save(entry);
  }

  /**
   * Vérifie si un token est dans la blacklist.
   *
   * La comparaison se fait sur l'empreinte SHA-256 du jeton transmis : le
   * comportement observable est identique à une comparaison en clair, sans
   * jamais stocker ni exposer le jeton.
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const count = await this.blacklistRepo.count({
      where: { token: tokenHash },
    });
    return count > 0;
  }

  /**
   * Invalide tous les tokens d'un utilisateur (ex: reset password, suspicion de compromission).
   */
  async invalidateAllForUser(userId: string, reason: string): Promise<void> {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours max
    const entry = this.blacklistRepo.create({
      // Sentinelle non réversible : ce n'est pas un JWT exploitable, elle ne
      // correspond donc jamais à l'empreinte d'un vrai jeton. Conserve pour
      // trace l'information d'invalidation globale demandée.
      token: `global-invalidation:${userId}:${Date.now()}`,
      userId,
      expiresAt: futureDate,
      tokenType: 'access',
      reason,
    });
    await this.blacklistRepo.save(entry);
    // TODO(AUDIT-004) : mécanisme d'invalidation globale à remplacer par un
    // tokenVersion. En l'état cette ligne n'invalide aucun jeton réellement
    // émis (rien ne la consulte).
  }

  /**
   * Nettoie les entrées expirées de la blacklist.
   * À appeler périodiquement (ex: cron job ou lors du login).
   */
  async cleanExpired(): Promise<number> {
    const result = await this.blacklistRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(
        `Blacklist nettoyée : ${deleted} entrées expirées supprimées.`,
      );
    }
    return deleted;
  }
}
