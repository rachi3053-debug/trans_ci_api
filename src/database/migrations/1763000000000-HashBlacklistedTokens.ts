import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hache les jetons JWT en clair stockés dans `token_blacklist.token`.
 *
 * CONTEXTE : jusqu'ici la colonne `token` contenait le JWT complet. Une
 * simple lecture de la base (dump SQL, backup, réplication, accès en lecture
 * seule) fournissait des jetons directement rejouables comme `Bearer` ou sur
 * `POST /auth/refresh`. `TokenBlacklistService.add()` n'écrit désormais que
 * l'empreinte SHA-256 (64 caractères hexadécimaux), comme le fait déjà
 * `ActivationService` pour les jetons d'activation.
 *
 * DÉCISION (option A) : le nom de la colonne est conservé. Aucun `ALTER
 * TABLE`, aucun changement de schéma, l'index unique
 * `IDX_token_blacklist_token` reste valide tel quel. La sémantique de la
 * colonne (« empreinte SHA-256 du token ») est documentée dans
 * `TokenBlacklist` et dans `TokenBlacklistService.hashToken()`.
 *
 * Les lignes existantes EN CLAIR sont transformées (et non purgées) afin de
 * conserver le comportement de blacklist : un jeton déjà révoqué doit rester
 * refusé après la migration. Les lignes déjà au format hexadécimal 64
 * caractères sont laissées intactes, ce qui rend la migration idempotente
 * (un JWT contient toujours des points, il ne peut donc pas être confondu
 * avec une empreinte). Les sentinelles `global-invalidation:*`
 * (cf. TODO(AUDIT-004)) sont hachées elles aussi : elles ne contiennent aucun
 * secret et la transformation reste uniforme.
 *
 * PostgreSQL >= 11 est requis pour la fonction native `sha256(bytea)`
 * (aucune extension `pgcrypto` n'est nécessaire).
 */
export class HashBlacklistedTokens1763000000000 implements MigrationInterface {
  name = 'HashBlacklistedTokens1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner))) {
      // Base fraîche (table pas encore créée par AddMultiTenancy) : rien à faire.
      return;
    }

    // 1. Inventaire des index uniques existants sur la colonne, afin de les
    //    recréer à l'identique après la transformation.
    const uniqueIndexes = await this.dropUniqueTokenIndexes(queryRunner);

    // 2. Transformation des valeurs en clair -> SHA-256 hexadécimal.
    //    L'index unique a été retiré : la transformation est atomique par
    //    ligne, aucune contrainte ne peut être violée à ce stade.
    await queryRunner.query(
      `UPDATE "token_blacklist"
          SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
        WHERE "token" !~ '^[0-9a-f]{64}$'`,
    );

    // 3. Sécurité de l'index unique : le SHA-256 ne produit pas de collision
    //    pratique, mais on déduplique tout de même les éventuels doublons
    //    (état partiel, double exécution manuelle) en gardant la plus
    //    ancienne ligne de chaque groupe.
    await queryRunner.query(
      `DELETE FROM "token_blacklist" AS duplicate
        USING "token_blacklist" AS kept
        WHERE duplicate."token" = kept."token"
          AND duplicate."id" > kept."id"`,
    );

    // 4. Recréation de l'index unique canonique + de tout index inventorié.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_token_blacklist_token"
         ON "token_blacklist" ("token")`,
    );
    for (const indexName of uniqueIndexes) {
      if (indexName === 'IDX_token_blacklist_token') {
        continue;
      }
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}"
           ON "token_blacklist" ("token")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La transformation est IRRÉVERSIBLE par construction (SHA-256 non
    // réversible) et c'est volontaire :
    //  - on ne restaure JAMAIS les jetons en clair dans la base ;
    //  - on ne supprime PAS les empreintes, ce qui ré-autoriserait des jetons
    //    qui ont été explicitement révoqués (régression de sécurité).
    // Seul l'index unique est remis en place s'il venait à manquer.
    if (!(await this.tableExists(queryRunner))) {
      return;
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_token_blacklist_token"
         ON "token_blacklist" ("token")`,
    );
  }

  /** La table `token_blacklist` existe-t-elle dans le schéma courant ? */
  private async tableExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'token_blacklist'
        LIMIT 1`,
    )) as unknown as unknown[];
    return rows.length > 0;
  }

  /**
   * Supprime tous les index uniques portant sur `token_blacklist.token` et
   * retourne leurs noms, afin de pouvoir les recréer à l'identique après la
   * transformation des valeurs.
   */
  private async dropUniqueTokenIndexes(
    queryRunner: QueryRunner,
  ): Promise<string[]> {
    // Catalogue PostgreSQL (plutôt qu'un LIKE sur `pg_indexes.indexdef`) :
    // on cible précisément les index uniques à une seule colonne, dont
    // l'unique colonne est `token`.
    const rows = (await queryRunner.query(
      `SELECT idx.relname AS indexname
         FROM pg_index ix
         JOIN pg_class tbl ON tbl.oid = ix.indrelid
         JOIN pg_class idx ON idx.oid = ix.indexrelid
         JOIN pg_attribute att
           ON att.attrelid = tbl.oid
          AND att.attnum = ix.indkey[0]
        WHERE tbl.relname = 'token_blacklist'
          AND tbl.relnamespace = current_schema()::regnamespace
          AND ix.indisunique
          AND ix.indnatts = 1
          AND att.attname = 'token'`,
    )) as unknown as Array<{ indexname: string }>;

    for (const row of rows) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${row.indexname}"`);
    }
    return rows.map((row) => row.indexname);
  }
}
