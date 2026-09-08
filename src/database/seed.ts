import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

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
  console.log('Connexion à la base de données...');

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    for (const perm of PERMISSIONS) {
      await qr.query(
        `INSERT INTO "permissions" ("code", "libelle", "module", "action")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("code") DO NOTHING`,
        [perm.code, perm.libelle, perm.module, perm.action],
      );
    }
    console.log(`${PERMISSIONS.length} permissions créées`);

    for (const role of ROLES) {
      await qr.query(
        `INSERT INTO "roles" ("code", "libelle", "description")
         VALUES ($1, $2, $3) ON CONFLICT ("code") DO NOTHING`,
        [role.code, role.libelle, role.description],
      );
    }
    console.log(`${ROLES.length} rôles créés`);

    for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
      const rows = await queryIds(
        qr,
        `SELECT "id" FROM "roles" WHERE "code" = $1`,
        [roleCode],
      );
      if (rows.length === 0) continue;
      const roleId = rows[0].id;

      for (const permCode of permCodes) {
        const permRows = await queryIds(
          qr,
          `SELECT "id" FROM "permissions" WHERE "code" = $1`,
          [permCode],
        );
        if (permRows.length === 0) continue;

        await qr.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id")
           VALUES ($1, $2) ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
          [roleId, permRows[0].id],
        );
      }
    }
    console.log('Permissions assignées aux rôles');

    const adminPasswordHash = await bcrypt.hash('Admin@1234!', 12);
    await qr.query(
      `INSERT INTO "users" ("nom", "prenom", "email", "password", "actif", "email_verified")
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("email") DO NOTHING`,
      ['Admin', 'Système', 'admin@transci.com', adminPasswordHash, true, true],
    );

    const adminRows = await queryIds(
      qr,
      `SELECT "id" FROM "users" WHERE "email" = $1`,
      ['admin@transci.com'],
    );
    if (adminRows.length > 0) {
      const roleRows = await queryIds(
        qr,
        `SELECT "id" FROM "roles" WHERE "code" = 'ADMIN'`,
      );
      if (roleRows.length > 0) {
        await qr.query(
          `INSERT INTO "user_roles" ("user_id", "role_id")
           VALUES ($1, $2) ON CONFLICT ("user_id", "role_id") DO NOTHING`,
          [adminRows[0].id, roleRows[0].id],
        );
      }
      console.log('Utilisateur admin créé: admin@transci.com / Admin@1234!');
    }

    await qr.commitTransaction();
    console.log('Seed terminé avec succès');
  } catch (error) {
    await qr.rollbackTransaction();
    console.error('Erreur lors du seed:', error);
    throw error;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

void seed();
