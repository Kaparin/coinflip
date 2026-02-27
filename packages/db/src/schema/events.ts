import { pgTable, uuid, text, timestamp, numeric, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(), // 'contest' | 'raffle'
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'calculating' | 'completed' | 'archived'
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    config: jsonb('config').notNull().default('{}'),
    prizes: jsonb('prizes').notNull().default('[]'),
    totalPrizePool: numeric('total_prize_pool', { precision: 38, scale: 0 }).default('0'),
    results: jsonb('results'),
    raffleSeed: text('raffle_seed'),
    createdBy: text('created_by').notNull(), // admin address
    userId: uuid('user_id').references(() => users.id), // sponsor user (null = admin event)
    sponsoredStatus: text('sponsored_status'), // null | 'pending' | 'approved' | 'rejected'
    pricePaid: numeric('price_paid', { precision: 38, scale: 0 }),
    rejectedReason: text('rejected_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_status_idx').on(table.status),
    index('events_type_status_idx').on(table.type, table.status),
    index('events_starts_at_idx').on(table.startsAt),
    index('events_ends_at_idx').on(table.endsAt),
  ],
);

export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').default('joined'), // raffle: 'joined' | 'winner' | 'not_selected'; contest: 'ranked' | 'winner'
    finalMetric: numeric('final_metric', { precision: 38, scale: 0 }),
    finalRank: integer('final_rank'),
    prizeAmount: numeric('prize_amount', { precision: 38, scale: 0 }),
    prizeTxHash: text('prize_tx_hash'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('event_participants_event_user_uniq').on(table.eventId, table.userId),
    index('event_participants_event_idx').on(table.eventId),
    index('event_participants_user_idx').on(table.userId),
  ],
);
