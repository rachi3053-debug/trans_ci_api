import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige le soft delete sur les tables métier.
 *
 * Contexte : les colonnes `deleted_at` de `permissions`, `roles` et `users`
 * étaient `NOT NULL DEFAULT now()`. Résultat : chaque ligne créée/sauvée sans
 * valeur explicite recevait `deleted_at = now()` et était donc invisible pour
 * toutes les requêtes filtrées par `deletedAt IS NULL` (listes vides partout).
 *
 * Correctif :
 * 1. Les lignes existantes redeviennent actives (`deleted_at = NULL`).
 * 2. La colonne redevient NULLABLE, sans valeur par défaut (comportement
 *    attendu du soft delete : vide tant que l'entité n'est pas supprimée).
 */
export class FixSoftDeleteColumns1758000000000 implements MigrationInterface {
  name = 'FixSoftDeleteColumns1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['permissions', 'roles', 'users']) {
      const exists = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = '${table}'
             AND column_name = 'deleted_at'
         )`,
      )) as { exists: boolean }[];
      if (!exists[0].exists) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD "deleted_at" TIMESTAMP`,
        );
        continue;
      }
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "deleted_at" DROP DEFAULT`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "deleted_at" DROP NOT NULL`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "deleted_at" = NULL WHERE "deleted_at" IS NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['permissions', 'roles', 'users']) {
      const exists = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = '${table}'
             AND column_name = 'deleted_at'
         )`,
      )) as { exists: boolean }[];
      if (exists[0].exists) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "deleted_at" SET DEFAULT now()`,
        );
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "deleted_at" SET NOT NULL`,
        );
      }
    }
  }
}
