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

ds.initialize()
  .then(async () => {
    await ds.query(
      "INSERT INTO migrations (timestamp, name) VALUES (1756000000000, 'CreateAuthTables1756000000000') ON CONFLICT DO NOTHING",
    );
    process.stdout.write('Migration marquee comme faite\n');
    await ds.destroy();
  })
  .catch((e: Error) => {
    process.stderr.write(`Erreur: ${e.message}\n`);
    process.exit(1);
  });
