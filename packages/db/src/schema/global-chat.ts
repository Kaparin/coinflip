import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const globalChatMessages = pgTable(
  'global_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    message: text('message').notNull(),
    style: text('style'), // null = normal, 'highlighted' = golden border, 'pinned' = super chat
    effect: text('effect'), // null = none, 'confetti' | 'coins' | 'fire'
    personaId: text('persona_id'), // AI bot persona id (for resolving display name / avatar)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_chat_messages_created').on(t.createdAt),
  ],
);
