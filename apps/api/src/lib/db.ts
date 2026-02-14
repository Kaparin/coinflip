import { createDb, type Database } from '@coinflip/db';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = createDb(env.DATABASE_URL);
    logger.info('Database connection established');
  }
  return db;
}
