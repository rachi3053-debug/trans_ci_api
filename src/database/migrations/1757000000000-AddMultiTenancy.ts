import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiTenancy1757000000000 implements MigrationInterface {
  name = 'AddMultiTenancy1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Table tenants (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "code" VARCHAR NOT NULL UNIQUE,
        "nom" VARCHAR NOT NULL,
        "subdomain" VARCHAR UNIQUE,
        "domain" VARCHAR,
        "logo" VARCHAR,
        "settings" JSONB,
        "is_active" BOOLEAN DEFAULT true NOT NULL,
        "max_users" INTEGER DEFAULT 50 NOT NULL,
        "subscription_plan" VARCHAR,
        "subscription_expires_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT now() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT now() NOT NULL,
        "deleted_at" TIMESTAMP,
        "created_by" VARCHAR,
        "updated_by" VARCHAR,
        "deleted_by" VARCHAR
      )
    `);

    // Index tenants (idempotent)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenants_code" ON "tenants" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenants_subdomain" ON "tenants" ("subdomain")`,
    );

    // 2. Ajouter tenant_id aux tables existantes (vérifier existence d'abord)
    const tables = [
      'users',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'api_keys',
    ];
    for (const table of tables) {
      const columnExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = 'tenant_id'
        )
      `);
      if (!columnExists[0].exists) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD "tenant_id" UUID`);
      }
    }

    // 3. Index pour le filtrage par tenant (idempotent)
    for (const table of tables) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_tenant_id" ON "${table}" ("tenant_id")`,
      );
    }

    // 4. Unicité partielle par tenant (vérifier existence)
    const uniqueIndexes = [
      {
        name: 'IDX_users_email_tenant',
        table: 'users',
        columns: '"email", "tenant_id"',
      },
      {
        name: 'IDX_roles_code_tenant',
        table: 'roles',
        columns: '"code", "tenant_id"',
      },
      {
        name: 'IDX_permissions_code_tenant',
        table: 'permissions',
        columns: '"code", "tenant_id"',
      },
    ];
    for (const idx of uniqueIndexes) {
      const exists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = '${idx.name}'
        )
      `);
      if (!exists[0].exists) {
        await queryRunner.query(`
          CREATE UNIQUE INDEX "${idx.name}" ON "${idx.table}" (${idx.columns})
          WHERE "tenant_id" IS NOT NULL
        `);
      }
    }

    // 5. Table audit_logs (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" VARCHAR,
        "user_email" VARCHAR,
        "entity_type" VARCHAR NOT NULL,
        "entity_id" VARCHAR,
        "action" VARCHAR NOT NULL,
        "description" TEXT,
        "ip_address" VARCHAR,
        "user_agent" VARCHAR,
        "metadata" JSONB,
        "created_at" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_type" ON "audit_logs" ("entity_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_id" ON "audit_logs" ("entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")`,
    );

    // 6. Table token_blacklist (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_blacklist" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "token" TEXT NOT NULL,
        "user_id" VARCHAR,
        "token_type" VARCHAR DEFAULT 'access' NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "reason" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_token_blacklist_token" ON "token_blacklist" ("token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "token_blacklist"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_permissions_code_tenant"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_code_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_tenant"`);

    const tables = [
      'api_keys',
      'role_permissions',
      'user_roles',
      'permissions',
      'roles',
      'users',
    ];
    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "tenant_id"`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
