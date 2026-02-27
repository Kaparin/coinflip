import { pgTable, uuid, text, integer, numeric, timestamp } from 'drizzle-orm/pg-core';

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  priority: text('priority').notNull().default('normal'),
  sentCount: integer('sent_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Sponsored announcement fields
  userId: uuid('user_id'),
  status: text('status').notNull().default('published'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectedReason: text('rejected_reason'),
  pricePaid: numeric('price_paid', { precision: 38, scale: 0 }),
});
