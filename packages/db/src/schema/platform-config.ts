import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const platformConfig = pgTable('platform_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  valueType: text('value_type').notNull().default('string'),
  description: text('description'),
  category: text('category').notNull().default('general'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});
