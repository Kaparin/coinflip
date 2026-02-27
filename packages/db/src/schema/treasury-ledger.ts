import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';

export const treasuryLedger = pgTable('treasury_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  txhash: text('txhash').notNull(),
  amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
  denom: text('denom').notNull().default('COIN'),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
