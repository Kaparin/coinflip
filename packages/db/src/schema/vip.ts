import { pgTable, uuid, text, timestamp, numeric, integer, index, bigint, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { bets } from './bets';

/**
 * VIP subscription history.
 * Each purchase creates a new row; active = expires_at > NOW() AND canceled_at IS NULL.
 */
export const vipSubscriptions = pgTable(
  'vip_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tier: text('tier').notNull(), // 'silver' | 'gold' | 'diamond'
    pricePaid: numeric('price_paid', { precision: 38, scale: 0 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_vip_sub_user').on(table.userId),
  ],
);

/**
 * VIP tier configuration (admin-editable prices).
 * Seeded with 3 tiers: silver, gold, diamond.
 */
export const vipConfig = pgTable('vip_config', {
  tier: text('tier').primaryKey(),
  price: numeric('price', { precision: 38, scale: 0 }).notNull(),
  yearlyPrice: numeric('yearly_price', { precision: 38, scale: 0 }),
  isActive: integer('is_active').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pinned bet slots (3 max). Auction-style: outbid = 2x current price.
 */
export const betPins = pgTable(
  'bet_pins',
  {
    slot: integer('slot').primaryKey(),
    betId: bigint('bet_id', { mode: 'bigint' })
      .notNull()
      .references(() => bets.betId),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    price: numeric('price', { precision: 38, scale: 0 }).notNull(),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('slot_range', sql`${table.slot} BETWEEN 1 AND 3`),
  ],
);

/**
 * Diamond VIP customization — preset IDs for name gradient, frame style, badge icon.
 */
export const vipCustomization = pgTable('vip_customization', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  nameGradient: text('name_gradient').notNull().default('default'),
  frameStyle: text('frame_style').notNull().default('default'),
  badgeIcon: text('badge_icon').notNull().default('default'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Boost usage tracking — one row per boost action, for daily limit enforcement.
 */
export const boostUsage = pgTable(
  'boost_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    betId: bigint('bet_id', { mode: 'bigint' })
      .notNull()
      .references(() => bets.betId),
    usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_boost_usage_day').on(table.userId, table.usedAt),
  ],
);
