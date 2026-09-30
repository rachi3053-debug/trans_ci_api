import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les fonctionnalités de gestion d'accès utilisateur :
 * - colonnes de verrouillage de compte sur `users`
 *   (access_locked, locked_at, locked_by, lock_reason)
 * - flag `first_connexion` (mot de passe provisoire à changer)
 * - table `user_access_lock_history` (traçabilité lock/unlock)
 *
 * Script idempotent : chaque instruction vérifie l'existant.
 */
export class AddUserAccessFeatures1759000000000 implements MigrationInterface {
  name = 'AddUserAccessFeatures1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Colonnes de verrouillage + première connexion
    const userColumns = [
      { name: 'access_locked', ddl: `BOOLEAN NOT NULL DEFAULT false` },
      { name: 'locked_at', ddl: `TIMESTAMP` },
      { name: 'locked_by', ddl: `VARCHAR` },
      { name: 'lock_reason', ddl: `TEXT` },
      { name: 'first_connexion', ddl: `BOOLEAN NOT NULL DEFAULT false` },
    ];
    for (const col of userColumns) {
      const exists = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'users'
             AND column_name = '${col.name}'
         )`,
      )) as { exists: boolean }[];
      if (!exists[0].exists) {
        await queryRunner.query(
          `ALTER TABLE "users" ADD COLUMN "${col.name}" ${col.ddl}`,
        );
      }
    }

    // Historique des blocages / déblocages
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_access_lock_history" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "action" VARCHAR NOT NULL,
        "reason" TEXT,
        "performed_by" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_access_lock_history_user_id"
         ON "user_access_lock_history" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_access_lock_history_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_access_lock_history"`);

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "access_locked"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "locked_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "locked_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lock_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "first_connexion"`,
    );
  }
}
