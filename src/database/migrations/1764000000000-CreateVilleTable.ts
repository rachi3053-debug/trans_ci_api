import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cree la table `villes` - donnees de REFERENCE GLOBALE.
 *
 * CONTRASTE AVEC LES AUTRES ENTITES DU PROJET
 * `users`, `roles` et `permissions` portent toutes un index unique PARTIEL :
 * `WHERE "tenant_id" IS NOT NULL`. Cette strategie n'a pas de sens sur
 * `tenant_id` ici : une ville n'appartient a aucun tenant, la colonne vaut
 * toujours `null`, et un index partiel `IS NOT NULL` ne porterait donc aucune
 * ligne. C'est sur `deleted_at` que le partiell s'applique, car le module est
 * en suppression LOGIQUE (cf. section ci-dessous).
 *
 * UNICITE INsensible A LA CASSE
 * `nom` et `code` sont uniques, sans distinction de casse ni espaces de bord.
 * La garantie repose sur des index uniques FONCTIONnels (`LOWER(...)`), que
 * TypeORM ne sait pas exprimer par un decorateur lisible : la migration en est
 * la source de verite, `synchronize` etant desactive.
 *
 * Ces index sont la SEULE garantie reelle d'unicite : la verification
 * applicative de `VilleService.assertNoDuplicate` peut etre franchie par deux
 * requetes concurrentes. En cas de violation, PostgreSQL renvoie une erreur
 * `23505`, convertie en conflit HTTP par `HttpExceptionFilter.mapDbError`.
 *
 * INDEX PARTIELS SUR `deleted_at IS NULL`
 * Raison : une ville supprimee conserve sa ligne en base, et donc son `code` et
 * son `nom`. Avec des index uniques PLEINS, ces valeurs resteraient reservees
 * DEFINITIVEMENT - impossible de recreer une ville `Abidjan` apres l'avoir
 * supprimee, alors que la corbeille existe precisement pour la reintroduire.
 * Le meme blocage surviendrait sur `POST /villes/:id/restore`, dont la
 * revalidation d'unicite echouerait alors sur une erreur SQL brute au lieu
 * d'un 409 explicite.
 *
 * Contrepartie assumee : une ville en corbeille et une ville active ne peuvent
 * pas porter le meme nom. Situation sans effet pratique - une ville en
 * corbeille n'est plus referencee - et preferable a un code bloque a jamais.
 *
 * ADDBITIVITE
 * La migration cree une table nouvelle : aucune donnee existante n'est
 * touchee. `up()` est idempotent (`IF NOT EXISTS`) et `down()` ne supprime que
 * cette table.
 */
export class CreateVilleTable1764000000000 implements MigrationInterface {
  name = 'CreateVilleTable1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "villes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "nom" varchar(100) NOT NULL,
        "code" varchar(20) NOT NULL,
        "region" varchar(100),
        "departement" varchar(100),
        "code_postal" varchar(20),
        "actif" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp,
        "created_by" varchar,
        "updated_by" varchar,
        "deleted_by" varchar
      )
    `);

    // Unicite fonctionnelle, insensible a la casse, PARTIELLE sur les lignes
    // actives (cf. section "INDEX PARTIELS" de l'en-tete).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_villes_code_lower" ON "villes" (LOWER("code")) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_villes_nom_lower" ON "villes" (LOWER("nom")) WHERE "deleted_at" IS NULL`,
    );

    // Index de consultation : recherche plein texte, filtres de division
    // administrative et corbeille.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_villes_nom" ON "villes" ("nom")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_villes_code" ON "villes" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_villes_region" ON "villes" ("region")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_villes_deleted_at" ON "villes" ("deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // `DROP TABLE` emporte les index : aucun retrait unitaire n'est necessaire.
    await queryRunner.query(`DROP TABLE IF EXISTS "villes"`);
  }
}
