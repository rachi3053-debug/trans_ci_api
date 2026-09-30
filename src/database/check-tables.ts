import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.HOST_DB,
  port: Number(process.env.PORT_DB ?? 6543),
  username: process.env.USER_DB,
  password: process.env.PASSWORD_DB,
  database: process.env.DATABASE_DB,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const TABLES = [
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'api_keys',
];

ds.initialize()
  .then(async () => {
    for (const table of TABLES) {
      const cols = await ds.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );
      process.stdout.write(`\n=== ${table} ===\n`);
      for (const c of cols) {
        process.stdout.write(
          `  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}\n`,
        );
      }
    }
    await ds.destroy();
  })
  .catch((e: Error) => {
    process.stderr.write(`Erreur: ${e.message}\n`);
    process.exit(1);
  });
