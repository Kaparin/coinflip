import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export function createDb(connectionString: string) {
  const isNeon = connectionString.includes('.neon.tech');

  const client = postgres(connectionString, {
    max: isNeon ? 10 : 25,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: isNeon ? 60 * 5 : 60 * 30,
    ssl: isNeon ? 'require' : undefined,
    connection: isNeon ? { application_name: 'coinflip-api' } : undefined,
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from './schema/index';
