import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  address: text('address').notNull().unique(),
  profileNickname: text('profile_nickname'),
  avatarUrl: text('avatar_url'),
  referrerAddress: text('referrer_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
