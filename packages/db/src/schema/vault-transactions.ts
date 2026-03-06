import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const vaultTransactions = pgTable(
  'vault_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(), // 'deposit' | 'withdraw'
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    txHash: text('tx_hash'),
    status: text('status').notNull().default('confirmed'), // 'pending' | 'confirmed' | 'failed'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('vault_tx_user_idx').on(t.userId),
    index('vault_tx_type_idx').on(t.type),
    index('vault_tx_created_idx').on(t.createdAt),
  ],
);
