import { pgTable, uuid, text, numeric, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const achievementClaims = pgTable(
  'achievement_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    achievementId: text('achievement_id').notNull(),
    coinAmount: numeric('coin_amount').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_achievement_claim').on(t.userId, t.achievementId),
    index('idx_achievement_claims_user').on(t.userId),
  ],
);
