import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la colonne `avatar_path` (référence du fichier avatar dans
 * Supabase Storage, bucket `avatars`) sur la table `users`.
 *
 * Modification strictement additive : aucune donnée existante n'est touchée.
 */
export class AddUserAvatarPath1762000000000 implements MigrationInterface {
  name = 'AddUserAvatarPath1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'avatar_path';`,
    )) as unknown as Array<{ column_name: string }>;
    if (columns.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "avatar_path" varchar NULL;`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_path";`,
    );
  }
}
