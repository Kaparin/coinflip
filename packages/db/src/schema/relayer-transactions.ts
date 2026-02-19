import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const relayerTransactions = pgTable(
  'relayer_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    txHash: text('tx_hash'),
    userAddress: text('user_address').notNull(),
    contractAddress: text('contract_address'),
    action: text('action').notNull(),
    actionPayload: jsonb('action_payload'),
    memo: text('memo'),
    success: boolean('success'),
    code: integer('code'),
    rawLog: text('raw_log'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    attempt: integer('attempt'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('relayer_tx_created_at_idx').on(table.createdAt),
    index('relayer_tx_action_idx').on(table.action),
    index('relayer_tx_user_address_idx').on(table.userAddress),
    index('relayer_tx_tx_hash_idx').on(table.txHash),
  ],
);
