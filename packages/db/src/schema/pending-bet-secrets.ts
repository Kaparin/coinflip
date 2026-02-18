import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Temporary storage for bet secrets between broadcast and DB confirmation.
 *
 * When a bet is created, the maker_side and maker_secret are generated
 * in memory and passed to a background task. If that task fails (e.g., chain
 * polling timeout during batch operations), the secrets are lost forever,
 * making auto-reveal impossible.
 *
 * This table persists secrets keyed by commitment hash. Once the bet is
 * saved to the `bets` table with the secret, the row here is deleted.
 * The reconciliation sweep uses this table to recover secrets for
 * orphaned bets that were imported from the chain.
 *
 * Rows older than 1 hour can be safely garbage-collected.
 */
export const pendingBetSecrets = pgTable('pending_bet_secrets', {
  commitment: text('commitment').primaryKey(),
  makerSide: text('maker_side').notNull(),
  makerSecret: text('maker_secret').notNull(),
  txHash: text('tx_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
