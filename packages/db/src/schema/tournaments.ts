import { pgTable, uuid, text, timestamp, numeric, integer, jsonb, index, unique, boolean, date } from 'drizzle-orm/pg-core';
import { users } from './users';

// ---- Tournaments ----

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    titleEn: text('title_en'),
    titleRu: text('title_ru'),
    descriptionEn: text('description_en'),
    descriptionRu: text('description_ru'),

    /** draft | registration | active | calculating | completed | canceled | archived */
    status: text('status').notNull().default('draft'),

    /** Entry fee in uaxm (native AXM) */
    entryFee: numeric('entry_fee', { precision: 38, scale: 0 }).notNull().default('0'),

    /** Accumulated prize pool from entry fees (after commission) */
    prizePool: numeric('prize_pool', { precision: 38, scale: 0 }).notNull().default('0'),

    /** Bonus added by admin from relayer wallet */
    bonusPool: numeric('bonus_pool', { precision: 38, scale: 0 }).notNull().default('0'),

    /** Platform commission in basis points (0-2000 = 0-20%) */
    commissionBps: integer('commission_bps').notNull().default(0),

    /** Prize distribution: [{ place: 1, percent: 40 }, { place: 2, percent: 25 }, ...] */
    prizeDistribution: jsonb('prize_distribution').notNull().default('[]'),

    /**
     * Scoring config: { tiers: [{ minAmount: "1000000", maxAmount: "9999999", winPoints: 3, lossPoints: 1 }, ...] }
     * Amounts in uaxm
     */
    scoringConfig: jsonb('scoring_config').notNull(),

    /** Team config: { minSize: 1, maxSize: 10 } */
    teamConfig: jsonb('team_config').notNull().default('{"minSize":1,"maxSize":10}'),

    maxParticipants: integer('max_participants'),

    registrationStartsAt: timestamp('registration_starts_at', { withTimezone: true }).notNull(),
    registrationEndsAt: timestamp('registration_ends_at', { withTimezone: true }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),

    /** Final results JSON after calculation */
    results: jsonb('results'),

    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tournaments_status_idx').on(table.status),
    index('tournaments_starts_at_idx').on(table.startsAt),
    index('tournaments_ends_at_idx').on(table.endsAt),
    index('tournaments_reg_ends_at_idx').on(table.registrationEndsAt),
  ],
);

// ---- Tournament Teams ----

export const tournamentTeams = pgTable(
  'tournament_teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    avatarUrl: text('avatar_url'),
    captainUserId: uuid('captain_user_id')
      .notNull()
      .references(() => users.id),
    /** Unique invite code for closed teams */
    inviteCode: text('invite_code').unique(),
    isOpen: boolean('is_open').notNull().default(true),
    /** Cached team total points */
    totalPoints: numeric('total_points', { precision: 38, scale: 0 }).notNull().default('0'),
    finalRank: integer('final_rank'),
    prizeAmount: numeric('prize_amount', { precision: 38, scale: 0 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tournament_teams_tournament_idx').on(table.tournamentId),
    index('tournament_teams_captain_idx').on(table.captainUserId),
    unique('tournament_teams_name_uniq').on(table.tournamentId, table.name),
  ],
);

// ---- Tournament Participants ----

export const tournamentParticipants = pgTable(
  'tournament_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => tournamentTeams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    totalPoints: numeric('total_points', { precision: 38, scale: 0 }).notNull().default('0'),
    gamesPlayed: integer('games_played').notNull().default(0),
    gamesWon: integer('games_won').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    bestStreak: integer('best_streak').notNull().default(0),
    /** Track daily first game bonus (date of last counted first-game) */
    lastGameDate: date('last_game_date'),
    finalRank: integer('final_rank'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('tournament_participants_uniq').on(table.tournamentId, table.userId),
    index('tournament_participants_tournament_idx').on(table.tournamentId),
    index('tournament_participants_team_idx').on(table.teamId),
    index('tournament_participants_user_idx').on(table.userId),
    index('tournament_participants_points_idx').on(table.tournamentId, table.totalPoints),
  ],
);

// ---- Join Requests (for closed teams) ----

export const tournamentJoinRequests = pgTable(
  'tournament_join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => tournamentTeams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    unique('tournament_join_requests_uniq').on(table.teamId, table.userId),
    index('tournament_join_requests_team_idx').on(table.teamId),
    index('tournament_join_requests_user_idx').on(table.userId),
    index('tournament_join_requests_status_idx').on(table.teamId, table.status),
  ],
);

// ---- Point Logs (transparency & debugging) ----

export const tournamentPointLogs = pgTable(
  'tournament_point_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => tournamentParticipants.id, { onDelete: 'cascade' }),
    /** Reference to the resolved bet */
    betId: text('bet_id').notNull(),
    pointsEarned: integer('points_earned').notNull(),
    /** win | loss */
    reason: text('reason').notNull(),
    /** Bet amount in uaxm for reference */
    betAmount: numeric('bet_amount', { precision: 38, scale: 0 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tournament_point_logs_tournament_idx').on(table.tournamentId),
    index('tournament_point_logs_participant_idx').on(table.participantId),
    index('tournament_point_logs_bet_idx').on(table.betId),
  ],
);

// ---- Tournament Notifications / News Feed ----

export const tournamentNotifications = pgTable(
  'tournament_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** registration_open | registration_closing | started | last_day | ending_soon | ended | results */
    type: text('type').notNull(),
    title: text('title').notNull(),
    titleEn: text('title_en'),
    titleRu: text('title_ru'),
    message: text('message'),
    messageEn: text('message_en'),
    messageRu: text('message_ru'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tournament_notifications_tournament_idx').on(table.tournamentId),
    index('tournament_notifications_created_idx').on(table.createdAt),
  ],
);
