import { pgTable, uuid, text, timestamp, numeric, integer, index, unique, bigint } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Jackpot tier configuration (5 levels).
 * Seeded once, rarely changed.
 */
export const jackpotTiers = pgTable(
  'jackpot_tiers',
  {
    id: integer('id').primaryKey(), // 1–5
    name: text('name').notNull(), // 'mini' | 'medium' | 'large' | 'mega' | 'super_mega'
    targetAmount: numeric('target_amount', { precision: 38, scale: 0 }).notNull(), // micro-LAUNCH
    minGames: integer('min_games').notNull(), // minimum total_bets to be eligible
    contributionBps: integer('contribution_bps').notNull().default(20), // basis points from pot (20 = 0.2%)
    isActive: integer('is_active').notNull().default(1), // 1 = active, 0 = paused
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Jackpot pool instances — one active pool per tier at a time.
 * Cycles: filling → drawing → completed → new pool starts.
 */
export const jackpotPools = pgTable(
  'jackpot_pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tierId: integer('tier_id')
      .notNull()
      .references(() => jackpotTiers.id),
    cycle: integer('cycle').notNull().default(1), // round number for this tier
    currentAmount: numeric('current_amount', { precision: 38, scale: 0 }).notNull().default('0'),
    status: text('status').notNull().default('filling'), // 'filling' | 'drawing' | 'completed'
    winnerUserId: uuid('winner_user_id').references(() => users.id),
    winnerAddress: text('winner_address'),
    drawSeed: text('draw_seed'),
    winnerDrawnAt: timestamp('winner_drawn_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('jackpot_pools_tier_cycle_uniq').on(table.tierId, table.cycle),
    index('jackpot_pools_tier_status_idx').on(table.tierId, table.status),
    index('jackpot_pools_status_idx').on(table.status),
  ],
);

/**
 * Audit trail: contribution from each resolved bet to each pool.
 * Unique (pool_id, bet_id) prevents double-counting on indexer replay.
 */
export const jackpotContributions = pgTable(
  'jackpot_contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => jackpotPools.id),
    betId: bigint('bet_id', { mode: 'bigint' }).notNull(),
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('jackpot_contributions_pool_bet_uniq').on(table.poolId, table.betId),
    index('jackpot_contributions_pool_idx').on(table.poolId),
    index('jackpot_contributions_bet_idx').on(table.betId),
  ],
);
