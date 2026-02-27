import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  priority: text('priority').notNull().default('normal'),
  sentCount: integer('sent_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
