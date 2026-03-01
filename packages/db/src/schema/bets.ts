import { pgTable, bigint, uuid, numeric, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const bets = pgTable(
  'bets',
  {
    betId: bigint('bet_id', { mode: 'bigint' }).primaryKey(),
    makerUserId: uuid('maker_user_id')
      .notNull()
      .references(() => users.id),
    acceptorUserId: uuid('acceptor_user_id').references(() => users.id),
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    status: text('status').notNull().default('open'),
    commitment: text('commitment').notNull(),
    makerSide: text('maker_side'),       // 'heads' or 'tails' — stored server-side for auto-reveal
    makerSecret: text('maker_secret'),   // 64 hex chars — stored server-side for auto-reveal
    acceptorGuess: text('acceptor_guess'),

    createdHeight: bigint('created_height', { mode: 'bigint' }),
    acceptedHeight: bigint('accepted_height', { mode: 'bigint' }),
    resolvedHeight: bigint('resolved_height', { mode: 'bigint' }),

    createdTime: timestamp('created_time', { withTimezone: true }).notNull().defaultNow(),
    acceptedTime: timestamp('accepted_time', { withTimezone: true }),
    resolvedTime: timestamp('resolved_time', { withTimezone: true }),

    winnerUserId: uuid('winner_user_id').references(() => users.id),
    commissionAmount: numeric('commission_amount', { precision: 38, scale: 0 }),
    payoutAmount: numeric('payout_amount', { precision: 38, scale: 0 }),

    txhashCreate: text('txhash_create').notNull(),
    txhashAccept: text('txhash_accept'),
    txhashResolve: text('txhash_resolve'),

    boostedAt: timestamp('boosted_at', { withTimezone: true }),
  },
  (table) => [
    index('bets_status_idx').on(table.status),
    index('bets_maker_idx').on(table.makerUserId),
    index('bets_acceptor_idx').on(table.acceptorUserId),
    index('bets_created_time_idx').on(table.createdTime),
    // Composite indexes for common production query patterns
    index('bets_status_created_idx').on(table.status, table.createdTime),
    index('bets_maker_status_idx').on(table.makerUserId, table.status),
    index('bets_acceptor_status_idx').on(table.acceptorUserId, table.status),
    index('bets_status_resolved_idx').on(table.status, table.resolvedTime),
    // TX hash lookups (indexer + background tasks)
    index('bets_txhash_create_idx').on(table.txhashCreate),
    index('bets_txhash_accept_idx').on(table.txhashAccept),
    index('bets_commitment_idx').on(table.commitment),
    // Performance indexes (added in perf audit)
    index('bets_winner_idx').on(table.winnerUserId),
    index('bets_payout_desc_idx').on(table.payoutAmount),
  ],
);
