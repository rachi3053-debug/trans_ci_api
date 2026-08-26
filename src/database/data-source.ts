import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'node:path';

config({ path: join(__dirname, '..', '..', '.env') });

export default new DataSource({
  type: 'postgres',
  host: process.env.HOST_DB ,
  port: Number(process.env.PORT_DB ?? 6543),
  username: process.env.USER_DB ,
  password: process.env.PASSWORD_DB ,
  database: process.env.DATABASE_DB ,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});