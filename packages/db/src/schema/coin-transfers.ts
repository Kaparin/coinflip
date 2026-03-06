import { pgTable, uuid, text, timestamp, numeric, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const coinTransfers = pgTable(
  'coin_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    amount: numeric('amount', { precision: 38, scale: 0 }).notNull(),
    fee: numeric('fee', { precision: 38, scale: 0 }).notNull(),
    currency: text('currency').notNull(), // 'coin' or 'axm'
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coin_transfers_sender_idx').on(t.senderId),
    index('coin_transfers_recipient_idx').on(t.recipientId),
    index('coin_transfers_created_idx').on(t.createdAt),
  ],
);
