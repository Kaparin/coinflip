import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const newsPosts = pgTable(
  'news_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull().default('update'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    priority: text('priority').notNull().default('normal'),
    isPublished: integer('is_published').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('news_posts_published_idx').on(table.isPublished, table.publishedAt),
    index('news_posts_type_idx').on(table.type),
  ],
);
