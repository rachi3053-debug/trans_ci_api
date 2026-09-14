import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la finalité des jetons d'émission utilisateur.
 *
 * user_activation_tokens devient un support générique à usage unique :
 * - ACTIVATION : activation d'un compte invité (défaut, comportement historique)
 * - RESET : réinitialisation d'un mot de passe oublié
 */
export class AddPasswordResetPurpose1761000000000 implements MigrationInterface {
  name = 'AddPasswordResetPurpose1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPurpose = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'user_activation_tokens' AND column_name = 'purpose';`,
    );
    if (!hasPurpose.length) {
      await queryRunner.query(
        `ALTER TABLE "user_activation_tokens"
         ADD COLUMN "purpose" varchar(20) NOT NULL DEFAULT 'ACTIVATION';`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_activation_tokens_purpose"
       ON "user_activation_tokens" ("purpose");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_activation_tokens_purpose";`,
    );
    const hasPurpose = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'user_activation_tokens' AND column_name = 'purpose';`,
    );
    if (hasPurpose.length) {
      await queryRunner.query(
        `ALTER TABLE "user_activation_tokens" DROP COLUMN "purpose";`,
      );
    }
  }
}
