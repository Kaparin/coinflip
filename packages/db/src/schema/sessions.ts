import { pgTable, uuid, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  authzEnabled: boolean('authz_enabled').notNull().default(false),
  feeSponsored: boolean('fee_sponsored').notNull().default(false),
  authzExpirationTime: timestamp('authz_expiration_time', { withTimezone: true }),
  limitsJson: jsonb('limits_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
