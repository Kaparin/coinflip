import { pgTable, uuid, text, timestamp, bigint } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  address: text('address').notNull().unique(),
  profileNickname: text('profile_nickname'),
  avatarUrl: text('avatar_url'),
  referrerAddress: text('referrer_address'),
  telegramId: bigint('telegram_id', { mode: 'number' }),
  telegramUsername: text('telegram_username'),
  telegramFirstName: text('telegram_first_name'),
  telegramPhotoUrl: text('telegram_photo_url'),
  telegramLinkedAt: timestamp('telegram_linked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
