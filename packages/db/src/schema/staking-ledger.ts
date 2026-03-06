import { pgTable, uuid, numeric, timestamp, bigint, text, uniqueIndex, index } from 'drizzle-orm/pg-core';

/**
 * Tracks per-bet staking contributions (2% of pot → LAUNCH stakers).
 * Idempotent via unique(bet_id).
 * Entries start as 'pending', become 'flushed' after on-chain distribute() call.
 */
export const stakingLedger = pgTable(
  'staking_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    betId: bigint('bet_id', { mode: 'bigint' }).notNull(),
    /** Amount in micro-units (uaxm or micro-COIN depending on game mode) */
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    /** 'pending' = awaiting flush to chain, 'flushed' = distribute() called */
    status: text('status').notNull().default('pending'),
    /** tx hash of the distribute() call (set on flush) */
    flushTxHash: text('flush_tx_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('staking_ledger_bet_uniq').on(table.betId),
    index('staking_ledger_status_idx').on(table.status),
  ],
);
