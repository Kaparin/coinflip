import { pgTable, uuid, text, numeric, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/** Unique referral codes for each user */
export const referralCodes = pgTable('referral_codes', {
  code: text('code').primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Referral relationships (who invited whom) */
export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id)
      .unique(),
    referrerUserId: uuid('referrer_user_id')
      .notNull()
      .references(() => users.id),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('referrals_referrer_idx').on(table.referrerUserId),
  ],
);

/** Individual reward events from resolved bets */
export const referralRewards = pgTable(
  'referral_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    fromPlayerUserId: uuid('from_player_user_id')
      .notNull()
      .references(() => users.id),
    betId: numeric('bet_id', { precision: 38, scale: 0 }).notNull(),
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    level: integer('level').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ref_rewards_recipient_idx').on(table.recipientUserId),
    index('ref_rewards_bet_idx').on(table.betId),
    index('ref_rewards_from_player_idx').on(table.fromPlayerUserId),
  ],
);

/** Accumulated referral balance per user (claimable) */
export const referralBalances = pgTable('referral_balances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  unclaimed: numeric('unclaimed', { precision: 38, scale: 0 }).notNull().default('0'),
  totalEarned: numeric('total_earned', { precision: 38, scale: 0 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
