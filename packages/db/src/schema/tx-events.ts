import { pgTable, uuid, text, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const txEvents = pgTable(
  'tx_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    txhash: text('txhash').notNull(),
    height: bigint('height', { mode: 'bigint' }).notNull(),
    eventType: text('event_type').notNull(),
    attributes: jsonb('attributes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tx_events_txhash_idx').on(table.txhash),
    index('tx_events_event_type_idx').on(table.eventType),
    index('tx_events_height_idx').on(table.height),
    // Composite for deduplication: check (txhash, event_type) uniqueness
    index('tx_events_txhash_type_idx').on(table.txhash, table.eventType),
  ],
);
