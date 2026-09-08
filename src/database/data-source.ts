import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

config({ path: join(__dirname, '..', '..', '.env') });

const options = buildTypeOrmOptions();

export default new DataSource({
  ...options,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
} as DataSourceOptions);
