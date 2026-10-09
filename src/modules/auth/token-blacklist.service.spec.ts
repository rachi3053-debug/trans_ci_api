import { createHash } from 'node:crypto';
import { TokenBlacklistService } from './token-blacklist.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';

/**
 * Tests unitaires du service de blacklist : aucune base de données n'est
 * utilisée, le repository TypeORM est simulé par un faux store en mémoire.
 * L'objectif est de garantir qu'aucun JWT n'est stocké en clair tout en
 * préservant le comportement observable de la blacklist.
 */
describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let rows: TokenBlacklist[];

  const sha256 = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

  const REFRESH_TOKEN =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLXV1aWQiLCJ0eXAiOiJyZWZyZXNoIn0.signature-refresh';
  const ACCESS_TOKEN =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLXV1aWQiLCJ0eXAiOiJhY2Nlc3MifQ.signature-access';

  beforeEach(() => {
    rows = [];

    // Faux repository : seules les méthodes utilisées par le service sont
    // implémentées, avec la même sémantique que TypeORM.
    const fakeRepo = {
      create: (data: Partial<TokenBlacklist>): TokenBlacklist => ({
        id: `id-${rows.length + 1}`,
        token: data.token ?? '',
        userId: data.userId ?? null,
        tokenType: data.tokenType ?? 'access',
        expiresAt: data.expiresAt ?? new Date(),
        reason: data.reason ?? null,
        createdAt: new Date(),
      }),
      save: (entity: TokenBlacklist): Promise<TokenBlacklist> => {
        const alreadyStored = rows.some((row) => row.token === entity.token);
        if (alreadyStored) {
          // Reproduit la violation de l'index unique `IDX_token_blacklist_token`.
          return Promise.reject(
            new Error('duplicate key value violates unique constraint'),
          );
        }
        rows.push(entity);
        return Promise.resolve(entity);
      },
      count: (options: {
        where?: Partial<Record<'token', string>>;
      }): Promise<number> => {
        const token = options.where?.token;
        if (token === undefined) {
          return Promise.resolve(rows.length);
        }
        return Promise.resolve(
          rows.filter((row) => row.token === token).length,
        );
      },
      delete: (options: {
        expiresAt?: { value: Date };
      }): Promise<{ affected: number | null }> => {
        const limit = options.expiresAt?.value;
        if (!limit) {
          return Promise.resolve({ affected: 0 });
        }
        const remaining = rows.filter((row) => row.expiresAt >= limit);
        const affected = rows.length - remaining.length;
        rows = remaining;
        return Promise.resolve({ affected });
      },
    };

    service = new TokenBlacklistService(fakeRepo as never);
  });

  it('est instancié', () => {
    expect(service).toBeDefined();
  });

  describe('add / isBlacklisted', () => {
    it('ne stocke que l’empreinte SHA-256 du token, jamais le token en clair', async () => {
      await service.add(
        REFRESH_TOKEN,
        new Date(Date.now() + 3600_000),
        'user-uuid',
        'refresh',
        'rotation',
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].token).toBe(sha256(REFRESH_TOKEN));
      expect(rows[0].token).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].token).not.toContain(REFRESH_TOKEN);
      expect(JSON.stringify(rows)).not.toContain(REFRESH_TOKEN);
    });

    it('reconnaît un token précédemment blacklisté', async () => {
      await service.add(
        ACCESS_TOKEN,
        new Date(Date.now() + 3600_000),
        'user-uuid',
        'access',
        'logout',
      );

      await expect(service.isBlacklisted(ACCESS_TOKEN)).resolves.toBe(true);
    });

    it('ignore un token inconnu', async () => {
      await expect(service.isBlacklisted('token-inconnu')).resolves.toBe(false);
    });

    it('ne confond pas deux tokens différents', async () => {
      await service.add(ACCESS_TOKEN, new Date(Date.now() + 3600_000));

      await expect(service.isBlacklisted(REFRESH_TOKEN)).resolves.toBe(false);
      await expect(service.isBlacklisted(ACCESS_TOKEN)).resolves.toBe(true);
    });

    it('est idempotent : un second add du même token ne viole pas l’index unique', async () => {
      const expiresAt = new Date(Date.now() + 3600_000);

      await service.add(
        REFRESH_TOKEN,
        expiresAt,
        'user-uuid',
        'refresh',
        'rotation',
      );
      await service.add(
        REFRESH_TOKEN,
        expiresAt,
        'user-uuid',
        'refresh',
        'rotation',
      );

      expect(rows).toHaveLength(1);
      await expect(service.isBlacklisted(REFRESH_TOKEN)).resolves.toBe(true);
    });

    it('conserve les métadonnées de l’entrée (utilisateur, type, raison)', async () => {
      await service.add(
        REFRESH_TOKEN,
        new Date(Date.now() + 3600_000),
        'user-uuid',
        'refresh',
        'rotation',
      );

      expect(rows[0].userId).toBe('user-uuid');
      expect(rows[0].tokenType).toBe('refresh');
      expect(rows[0].reason).toBe('rotation');
    });

    it('applique les valeurs par défaut (type access, pas d’utilisateur, pas de raison)', async () => {
      await service.add(ACCESS_TOKEN, new Date(Date.now() + 3600_000));

      expect(rows[0].userId).toBeNull();
      expect(rows[0].tokenType).toBe('access');
      expect(rows[0].reason).toBeNull();
    });
  });

  describe('invalidateAllForUser (comportement inchangé, cf. TODO AUDIT-004)', () => {
    it('insère une sentinelle non réversible qui ne correspond à aucun JWT', async () => {
      await service.invalidateAllForUser('user-uuid', 'suspicion');

      expect(rows).toHaveLength(1);
      expect(rows[0].token).toMatch(/^global-invalidation:user-uuid:\d+$/);
      await expect(service.isBlacklisted(ACCESS_TOKEN)).resolves.toBe(false);
    });
  });

  describe('cleanExpired', () => {
    it('supprime les entrées expirées et retourne le nombre supprimé', async () => {
      await service.add('token-expire', new Date(Date.now() - 1000));
      await service.add('token-valide', new Date(Date.now() + 3600_000));

      await expect(service.cleanExpired()).resolves.toBe(1);
      expect(rows).toHaveLength(1);
      await expect(service.isBlacklisted('token-valide')).resolves.toBe(true);
      await expect(service.isBlacklisted('token-expire')).resolves.toBe(false);
    });

    it('retourne 0 quand il n’y a rien à nettoyer', async () => {
      await expect(service.cleanExpired()).resolves.toBe(0);
    });
  });
});
