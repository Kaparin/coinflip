import { pgTable, uuid, numeric, timestamp, bigint } from 'drizzle-orm/pg-core';
import { users } from './users';

export const vaultBalances = pgTable('vault_balances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  available: numeric('available', { precision: 38, scale: 0 }).notNull().default('0'),
  locked: numeric('locked', { precision: 38, scale: 0 }).notNull().default('0'),
  /** Off-chain prize credits — NOT overwritten by syncBalanceFromChain */
  bonus: numeric('bonus', { precision: 38, scale: 0 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  sourceHeight: bigint('source_height', { mode: 'bigint' }),
});
