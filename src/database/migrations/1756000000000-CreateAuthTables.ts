import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1756000000000 implements MigrationInterface {
  name = 'CreateAuthTables1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "nom" VARCHAR NOT NULL,
        "prenom" VARCHAR NOT NULL,
        "email" VARCHAR NOT NULL UNIQUE,
        "telephone" VARCHAR,
        "passwordHash" VARCHAR NOT NULL,
        "actif" BOOLEAN DEFAULT true NOT NULL,
        "emailVerified" BOOLEAN DEFAULT false NOT NULL,
        "lastLoginAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT now() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "code" VARCHAR NOT NULL UNIQUE,
        "libelle" VARCHAR NOT NULL,
        "description" VARCHAR,
        "actif" BOOLEAN DEFAULT true NOT NULL,
        "createdAt" TIMESTAMP DEFAULT now() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "code" VARCHAR NOT NULL UNIQUE,
        "libelle" VARCHAR NOT NULL,
        "description" VARCHAR,
        "module" VARCHAR NOT NULL,
        "action" VARCHAR NOT NULL,
        "actif" BOOLEAN DEFAULT true NOT NULL,
        "createdAt" TIMESTAMP DEFAULT now() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT now() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "roleId" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "assignedAt" TIMESTAMP DEFAULT now() NOT NULL,
        UNIQUE ("userId", "roleId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "roleId" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permissionId" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "assignedAt" TIMESTAMP DEFAULT now() NOT NULL,
        UNIQUE ("roleId", "permissionId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        "keyPrefix" VARCHAR NOT NULL,
        "keyHash" VARCHAR NOT NULL,
        "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expiresAt" TIMESTAMP,
        "lastUsedAt" TIMESTAMP,
        "actif" BOOLEAN DEFAULT true NOT NULL,
        "createdAt" TIMESTAMP DEFAULT now() NOT NULL,
        "revokedAt" TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_keys_keyPrefix" ON "api_keys" ("keyPrefix")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_api_keys_userId" ON "api_keys" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
