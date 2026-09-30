import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le flux « invitation → activation » des comptes utilisateurs :
 * - colonne `status` sur `users` (INVITED / ACTIVE / SUSPENDED / DISABLED),
 *   avec valeur par défaut ACTIVE pour ne pas modifier les comptes existants ;
 * - `password` devient NULLABLE (un compte invité n'a pas encore de mot de passe) ;
 * - table `user_activation_tokens` : stocke uniquement le SHA-256 du jeton
 *   (jamais le jeton brut) avec une seule entrée active par utilisateur.
 *
 * Script idempotent : chaque instruction vérifie l'existant.
 */
export class AddUserInvitationActivation1760000000000 implements MigrationInterface {
  name = 'AddUserInvitationActivation1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Colonne status (les comptes existants restent ACTIVE)
    const statusExists = (await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'
           AND column_name = 'status'
       )`,
    )) as { exists: boolean }[];
    if (!statusExists[0].exists) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`,
      );
    }

    // 2. password devient nullable (comptes invités sans mot de passe)
    const passwordNullable = (await queryRunner.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name = 'password'`,
    )) as { is_nullable: string }[];
    if (
      passwordNullable.length > 0 &&
      passwordNullable[0].is_nullable === 'NO'
    ) {
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
      );
    }

    // 3. Table des jetons d'activation (SHA-256 obligatoire, jamais le jeton brut)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_activation_tokens" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used_at" TIMESTAMP,
        "created_by" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_activation_tokens_token_hash"
         ON "user_activation_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_activation_tokens_user_id"
         ON "user_activation_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_activation_tokens_expires_at"
         ON "user_activation_tokens" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_activation_tokens_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_activation_tokens_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_activation_tokens_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_activation_tokens"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "status"`,
    );

    const passwordNullable = (await queryRunner.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name = 'password'`,
    )) as { is_nullable: string }[];
    if (
      passwordNullable.length > 0 &&
      passwordNullable[0].is_nullable === 'YES'
    ) {
      // NB : pourrait échouer si des comptes invités existent encore.
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
      );
    }
  }
}
