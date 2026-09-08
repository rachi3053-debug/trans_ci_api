import { join } from 'node:path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.HOST_DB,
    port: Number(process.env.PORT_DB ?? 6543),
    username: process.env.USER_DB,
    password: process.env.PASSWORD_DB,
    database: process.env.DATABASE_DB,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsRun: false,
  };
}
