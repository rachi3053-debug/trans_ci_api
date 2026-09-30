import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TokenBlacklist } from './entities/token-blacklist.entity';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @InjectRepository(TokenBlacklist)
    private readonly blacklistRepo: Repository<TokenBlacklist>,
  ) {}

  /**
   * Ajoute un token à la blacklist.
   * @param token - Le token JWT en clair
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
    const entry = this.blacklistRepo.create({
      token,
      userId: userId ?? null,
      expiresAt,
      tokenType,
      reason: reason ?? null,
    });
    await this.blacklistRepo.save(entry);
  }

  /**
   * Vérifie si un token est dans la blacklist.
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const count = await this.blacklistRepo.count({ where: { token } });
    return count > 0;
  }

  /**
   * Invalide tous les tokens d'un utilisateur (ex: reset password, suspicion de compromission).
   */
  async invalidateAllForUser(userId: string, reason: string): Promise<void> {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours max
    const entry = this.blacklistRepo.create({
      token: `global-invalidation:${userId}:${Date.now()}`,
      userId,
      expiresAt: futureDate,
      tokenType: 'access',
      reason,
    });
    await this.blacklistRepo.save(entry);
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
