import { pgTable, uuid, text, integer, numeric, timestamp, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const partnerConfig = pgTable('partner_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  bps: integer('bps').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partnerLedger = pgTable(
  'partner_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerId: uuid('partner_id').notNull().references(() => partnerConfig.id),
    betId: bigint('bet_id', { mode: 'bigint' }).notNull(),
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    status: text('status').notNull().default('accrued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('partner_ledger_partner_bet_uniq').on(table.partnerId, table.betId),
    index('partner_ledger_partner_idx').on(table.partnerId),
    index('partner_ledger_bet_idx').on(table.betId),
  ],
);
