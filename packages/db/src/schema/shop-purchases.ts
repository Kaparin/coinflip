import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const shopPurchases = pgTable(
  'shop_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    address: text('address').notNull(),
    chestTier: integer('chest_tier').notNull(),
    axmAmount: numeric('axm_amount', { precision: 38, scale: 0 }).notNull(),
    coinAmount: numeric('coin_amount', { precision: 38, scale: 0 }).notNull(),
    bonusCredited: numeric('bonus_credited', { precision: 38, scale: 0 }).notNull().default('0'),
    txHash: text('tx_hash').notNull().unique(),
    coinTxHash: text('coin_tx_hash'),
    bonusTxHash: text('bonus_tx_hash'),
    status: text('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('shop_purchases_user_idx').on(t.userId),
    index('shop_purchases_created_at_idx').on(t.createdAt),
  ],
);
