import { pgTable, uuid, text, timestamp, index, bigint } from 'drizzle-orm/pg-core';
import { users } from './users';
import { bets } from './bets';

export const betMessages = pgTable(
  'bet_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    betId: bigint('bet_id', { mode: 'bigint' })
      .notNull()
      .references(() => bets.betId),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bet_messages_bet_id_idx').on(t.betId),
    index('bet_messages_bet_created_idx').on(t.betId, t.createdAt),
  ],
);
