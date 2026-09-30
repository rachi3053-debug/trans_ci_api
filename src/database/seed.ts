import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const logger = new Logger('Seed');

config({ path: join(__dirname, '..', '..', '.env') });

interface IdRow {
  id: string;
}

async function queryIds(
  qr: ReturnType<DataSource['createQueryRunner']>,
  sql: string,
  params?: unknown[],
): Promise<IdRow[]> {
  return qr.query(sql, params) as Promise<IdRow[]>;
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.HOST_DB,
  port: Number(process.env.PORT_DB ?? 5432),
  username: process.env.USER_DB,
  password: process.env.PASSWORD_DB,
  database: process.env.DATABASE_DB,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  synchronize: false,
});

const ROLES = [
  {
    code: 'ADMIN',
    libelle: 'Administrateur',
    description: 'Accès total au système',
  },
  {
    code: 'OPERATEUR',
    libelle: 'Opérateur',
    description: 'Opérateur de traitement',
  },
  {
    code: 'SUPERVISEUR',
    libelle: 'Superviseur',
    description: 'Supervision et validation',
  },
  {
    code: 'CONSULTATION',
    libelle: 'Consultation',
    description: 'Accès en lecture seule',
  },
];

/**
 * Email du compte ROOT (super-administrateur système).
 * Le ROOT existe AVANT le multi-tenancy : il a tenant_id NULL et accès global.
 * Adapter cette valeur à l'email réel du compte ROOT existant.
 */
const ROOT_EMAIL = 'root@transci.com';

const PERMISSIONS = [
  {
    code: 'USER:READ',
    libelle: 'Consulter les utilisateurs',
    module: 'USER',
    action: 'READ',
  },
  {
    code: 'USER:CREATE',
    libelle: 'Créer un utilisateur',
    module: 'USER',
    action: 'CREATE',
  },
  {
    code: 'USER:UPDATE',
    libelle: 'Modifier un utilisateur',
    module: 'USER',
    action: 'UPDATE',
  },
  {
    code: 'USER:DELETE',
    libelle: 'Supprimer un utilisateur',
    module: 'USER',
    action: 'DELETE',
  },
  {
    code: 'ROLE:READ',
    libelle: 'Consulter les rôles',
    module: 'ROLE',
    action: 'READ',
  },
  {
    code: 'ROLE:CREATE',
    libelle: 'Créer un rôle',
    module: 'ROLE',
    action: 'CREATE',
  },
  {
    code: 'ROLE:UPDATE',
    libelle: 'Modifier un rôle',
    module: 'ROLE',
    action: 'UPDATE',
  },
  {
    code: 'ROLE:DELETE',
    libelle: 'Supprimer un rôle',
    module: 'ROLE',
    action: 'DELETE',
  },
  {
    code: 'PERMISSION:READ',
    libelle: 'Consulter les permissions',
    module: 'PERMISSION',
    action: 'READ',
  },
  {
    code: 'PERMISSION:CREATE',
    libelle: 'Créer une permission',
    module: 'PERMISSION',
    action: 'CREATE',
  },
  {
    code: 'PERMISSION:UPDATE',
    libelle: 'Modifier une permission',
    module: 'PERMISSION',
    action: 'UPDATE',
  },
  {
    code: 'PERMISSION:DELETE',
    libelle: 'Supprimer une permission',
    module: 'PERMISSION',
    action: 'DELETE',
  },
  {
    code: 'DEMANDE:READ',
    libelle: 'Consulter les demandes',
    module: 'DEMANDE',
    action: 'READ',
  },
  {
    code: 'DEMANDE:CREATE',
    libelle: 'Créer une demande',
    module: 'DEMANDE',
    action: 'CREATE',
  },
  {
    code: 'DEMANDE:UPDATE',
    libelle: 'Modifier une demande',
    module: 'DEMANDE',
    action: 'UPDATE',
  },
  {
    code: 'DEMANDE:DELETE',
    libelle: 'Supprimer une demande',
    module: 'DEMANDE',
    action: 'DELETE',
  },
  {
    code: 'DEMANDE:VALIDATE',
    libelle: 'Valider une demande',
    module: 'DEMANDE',
    action: 'VALIDATE',
  },
  {
    code: 'DOSSIER:READ',
    libelle: 'Consulter les dossiers',
    module: 'DOSSIER',
    action: 'READ',
  },
  {
    code: 'DOSSIER:CREATE',
    libelle: 'Créer un dossier',
    module: 'DOSSIER',
    action: 'CREATE',
  },
  {
    code: 'DOSSIER:UPDATE',
    libelle: 'Modifier un dossier',
    module: 'DOSSIER',
    action: 'UPDATE',
  },
  {
    code: 'DOSSIER:DELETE',
    libelle: 'Supprimer un dossier',
    module: 'DOSSIER',
    action: 'DELETE',
  },
  {
    code: 'RAPPORT:READ',
    libelle: 'Consulter les rapports',
    module: 'RAPPORT',
    action: 'READ',
  },
  {
    code: 'RAPPORT:EXPORT',
    libelle: 'Exporter les rapports',
    module: 'RAPPORT',
    action: 'EXPORT',
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    'USER:READ',
    'USER:CREATE',
    'USER:UPDATE',
    'USER:DELETE',
    'ROLE:READ',
    'ROLE:CREATE',
    'ROLE:UPDATE',
    'ROLE:DELETE',
    'PERMISSION:READ',
    'PERMISSION:CREATE',
    'PERMISSION:UPDATE',
    'PERMISSION:DELETE',
    'DEMANDE:READ',
    'DEMANDE:CREATE',
    'DEMANDE:UPDATE',
    'DEMANDE:DELETE',
    'DEMANDE:VALIDATE',
    'DOSSIER:READ',
    'DOSSIER:CREATE',
    'DOSSIER:UPDATE',
    'DOSSIER:DELETE',
    'RAPPORT:READ',
    'RAPPORT:EXPORT',
  ],
  SUPERVISEUR: [
    'USER:READ',
    'ROLE:READ',
    'PERMISSION:READ',
    'DEMANDE:READ',
    'DEMANDE:UPDATE',
    'DEMANDE:VALIDATE',
    'DOSSIER:READ',
    'DOSSIER:UPDATE',
    'RAPPORT:READ',
    'RAPPORT:EXPORT',
  ],
  OPERATEUR: [
    'DEMANDE:READ',
    'DEMANDE:CREATE',
    'DEMANDE:UPDATE',
    'DOSSIER:READ',
    'DOSSIER:CREATE',
    'DOSSIER:UPDATE',
    'RAPPORT:READ',
  ],
  CONSULTATION: ['DEMANDE:READ', 'DOSSIER:READ', 'RAPPORT:READ'],
};

async function seed(): Promise<void> {
  await dataSource.initialize();
  logger.log('Connexion à la base de données...');

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // 1. Créer le tenant par défaut
    const tenantRows = await queryIds(
      qr,
      `SELECT "id" FROM "tenants" WHERE "code" = $1`,
      ['DEFAULT'],
    );

    let tenantId: string;
    if (tenantRows.length > 0) {
      tenantId = tenantRows[0].id;
      logger.log(`Tenant DEFAULT existant: ${tenantId}`);
    } else {
      const result = await queryIds(
        qr,
        `INSERT INTO "tenants" ("code", "nom", "is_active")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['DEFAULT', 'TransCI par défaut', true],
      );
      tenantId = result[0].id;
      logger.log(`Tenant DEFAULT créé: ${tenantId}`);
    }

    // 2. Permissions (avec tenant_id)
    for (const perm of PERMISSIONS) {
      await qr.query(
        `INSERT INTO "permissions" ("code", "libelle", "module", "action", "tenant_id")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("code") DO UPDATE SET "tenant_id" = COALESCE("permissions"."tenant_id", $5)`,
        [perm.code, perm.libelle, perm.module, perm.action, tenantId],
      );
    }
    logger.log(`${PERMISSIONS.length} permissions créées`);

    // 3. Rôles (avec tenant_id)
    for (const role of ROLES) {
      await qr.query(
        `INSERT INTO "roles" ("code", "libelle", "description", "tenant_id")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("code") DO UPDATE SET "tenant_id" = COALESCE("roles"."tenant_id", $4)`,
        [role.code, role.libelle, role.description, tenantId],
      );
    }
    logger.log(`${ROLES.length} rôles créés`);

    // 4. Permissions assignées aux rôles
    for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
      const rows = await queryIds(
        qr,
        `SELECT "id" FROM "roles" WHERE "code" = $1 AND ("tenant_id" = $2 OR "tenant_id" IS NULL)`,
        [roleCode, tenantId],
      );
      if (rows.length === 0) continue;
      const roleId = rows[0].id;

      for (const permCode of permCodes) {
        const permRows = await queryIds(
          qr,
          `SELECT "id" FROM "permissions" WHERE "code" = $1 AND ("tenant_id" = $2 OR "tenant_id" IS NULL)`,
          [permCode, tenantId],
        );
        if (permRows.length === 0) continue;

        await qr.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
           VALUES ($1, $2, $3)
           ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
          [roleId, permRows[0].id, tenantId],
        );
      }
    }
    logger.log('Permissions assignées aux rôles');

    // 5. Utilisateur admin
    const adminPasswordHash = await bcrypt.hash('Admin@1234!', 12);
    const existingAdmin = await queryIds(
      qr,
      `SELECT "id" FROM "users" WHERE "email" = $1 AND ("tenant_id" = $2 OR "tenant_id" IS NULL)`,
      ['admin@transci.com', tenantId],
    );

    if (existingAdmin.length === 0) {
      const adminResult = await queryIds(
        qr,
        `INSERT INTO "users" ("nom", "prenom", "email", "password", "actif", "email_verified", "tenant_id")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
        [
          'Admin',
          'Système',
          'admin@transci.com',
          adminPasswordHash,
          true,
          true,
          tenantId,
        ],
      );

      const roleRows = await queryIds(
        qr,
        `SELECT "id" FROM "roles" WHERE "code" = 'ADMIN' AND ("tenant_id" = $1 OR "tenant_id" IS NULL)`,
        [tenantId],
      );
      if (roleRows.length > 0 && adminResult.length > 0) {
        await qr.query(
          `INSERT INTO "user_roles" ("user_id", "role_id", "tenant_id")
           VALUES ($1, $2, $3)
           ON CONFLICT ("user_id", "role_id") DO NOTHING`,
          [adminResult[0].id, roleRows[0].id, tenantId],
        );
      }
      logger.log('Utilisateur admin créé: admin@transci.com / Admin@1234!');
    } else {
      logger.log('Utilisateur admin déjà existant');
    }

    // 6. Mettre à jour les données existantes sans tenant_id
    await qr.query(
      `UPDATE "roles" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [tenantId],
    );
    await qr.query(
      `UPDATE "permissions" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [tenantId],
    );
    await qr.query(
      `UPDATE "user_roles" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [tenantId],
    );
    await qr.query(
      `UPDATE "role_permissions" SET "tenant_id" = $1 WHERE "tenant_id" IS NULL`,
      [tenantId],
    );
    logger.log('Données existantes associées au tenant DEFAULT');

    // 7. Compte ROOT (super-administrateur système)
    // À créer APRÈS l'étape 6 pour conserver tenant_id = NULL.
    await qr.query(
      `INSERT INTO "roles" ("code", "libelle", "description", "tenant_id", "actif")
       VALUES ($1, $2, $3, NULL, true)
       ON CONFLICT ("code") DO NOTHING`,
      [
        'ROOT',
        'Super Administrateur',
        'Accès total au système, tous tenants, toutes permissions',
      ],
    );
    logger.log('Rôle ROOT créé');

    const rootRoleRows = await queryIds(
      qr,
      `SELECT "id" FROM "roles" WHERE "code" = 'ROOT'`,
    );
    const rootRoleId = rootRoleRows[0]?.id;

    if (rootRoleId) {
      // Trouver l'ancien utilisateur ROOT existant
      const rootUserRows = await queryIds(
        qr,
        `SELECT "id" FROM "users" WHERE "email" = $1`,
        [ROOT_EMAIL],
      );

      let rootUserId: string | undefined;

      if (rootUserRows.length > 0) {
        rootUserId = rootUserRows[0].id;
        logger.log(`Utilisateur ROOT existant trouvé: ${ROOT_EMAIL}`);
      } else {
        // Créer le ROOT s'il n'existe pas encore
        const rootHash = await bcrypt.hash('Root@1234!', 12);
        const rootCreated = await queryIds(
          qr,
          `INSERT INTO "users" ("nom", "prenom", "email", "password", "actif", "email_verified", "tenant_id")
           VALUES ($1, $2, $3, $4, true, true, NULL) RETURNING "id"`,
          ['Super', 'Administrateur', ROOT_EMAIL, rootHash],
        );
        if (rootCreated.length > 0) {
          rootUserId = rootCreated[0].id;
          logger.log(`Utilisateur ROOT créé: ${ROOT_EMAIL} / Root@1234!`);
        }
      }

      if (rootUserId) {
        // Le ROOT doit rester GLOBAL : tenant_id = NULL
        await qr.query(
          `UPDATE "users" SET "tenant_id" = NULL WHERE "id" = $1`,
          [rootUserId],
        );

        // Assigner le rôle ROOT (lien avec tenant_id = NULL)
        await qr.query(
          `INSERT INTO "user_roles" ("user_id", "role_id", "tenant_id")
           VALUES ($1, $2, NULL)
           ON CONFLICT ("user_id", "role_id") DO NOTHING`,
          [rootUserId, rootRoleId],
        );

        // Nettoyer les liens d'anciens rôles du ROOT (il n'en a pas besoin)
        await qr.query(
          `DELETE FROM "user_roles" WHERE "user_id" = $1 AND "role_id" <> $2`,
          [rootUserId, rootRoleId],
        );

        logger.log(`Compte ROOT configuré: ${ROOT_EMAIL} (tenant_id = NULL)`);
      }
    }

    await qr.commitTransaction();
    logger.log('Seed terminé avec succès');
  } catch (error) {
    await qr.rollbackTransaction();
    logger.error('Erreur lors du seed:', error);
    throw error;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

void seed();
