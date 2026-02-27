import { z } from 'zod';
import 'zod-openapi/extend';
import { AmountSchema } from './common.js';

// ---- Enums ----

export const EventTypeSchema = z
  .enum(['contest', 'raffle'])
  .openapi({ description: 'Event type' });

export const EventStatusSchema = z
  .enum(['draft', 'active', 'calculating', 'completed', 'archived'])
  .openapi({ description: 'Event lifecycle status' });

export const ContestMetricSchema = z
  .enum(['turnover', 'wins', 'profit'])
  .openapi({ description: 'Contest ranking metric' });

// ---- Config schemas ----

export const ContestConfigSchema = z
  .object({
    metric: ContestMetricSchema,
    minBetAmount: AmountSchema.optional().openapi({ description: 'Minimum bet amount to count' }),
    autoJoin: z.boolean().openapi({ description: 'If true, all players auto-join the leaderboard' }),
  })
  .openapi({ ref: 'ContestConfig' });

export const RaffleConfigSchema = z
  .object({
    minBets: z.number().int().min(0).optional().openapi({ description: 'Minimum bets to be eligible' }),
    minTurnover: AmountSchema.optional().openapi({ description: 'Minimum turnover to be eligible' }),
    maxParticipants: z.number().int().min(1).optional().openapi({ description: 'Maximum raffle entries' }),
  })
  .openapi({ ref: 'RaffleConfig' });

// ---- Prize entry ----

export const PrizeEntrySchema = z
  .object({
    place: z.number().int().min(1).openapi({ description: 'Prize place (1st, 2nd, etc.)' }),
    amount: AmountSchema.openapi({ description: 'Prize amount in micro-COIN' }),
    label: z.string().optional().openapi({ description: 'Display label for this prize tier' }),
  })
  .openapi({ ref: 'PrizeEntry' });

// ---- Request schemas ----

export const CreateEventRequestSchema = z
  .object({
    type: EventTypeSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    config: z.union([ContestConfigSchema, RaffleConfigSchema]),
    prizes: z.array(PrizeEntrySchema).min(1),
    totalPrizePool: AmountSchema,
  })
  .openapi({ ref: 'CreateEventRequest' });

export const UpdateEventRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    config: z.union([ContestConfigSchema, RaffleConfigSchema]).optional(),
    prizes: z.array(PrizeEntrySchema).min(1).optional(),
    totalPrizePool: AmountSchema.optional(),
  })
  .openapi({ ref: 'UpdateEventRequest' });

// ---- Response schemas ----

export const EventResponseSchema = z
  .object({
    id: z.string().uuid(),
    type: EventTypeSchema,
    title: z.string(),
    description: z.string().nullable(),
    status: EventStatusSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    config: z.record(z.unknown()),
    prizes: z.array(PrizeEntrySchema),
    totalPrizePool: z.string(),
    results: z.union([z.array(z.record(z.unknown())), z.record(z.unknown())]).nullable(),
    raffleSeed: z.string().nullable(),
    participantCount: z.number().int(),
    hasJoined: z.boolean().optional(),
    myRank: z.number().int().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .openapi({ ref: 'EventResponse' });

export const EventLeaderboardEntrySchema = z
  .object({
    rank: z.number().int(),
    userId: z.string().uuid(),
    address: z.string(),
    nickname: z.string().nullable(),
    turnover: z.string(),
    wins: z.number().int(),
    profit: z.string(),
    games: z.number().int(),
    metric: ContestMetricSchema,
    prizeAmount: z.string().nullable(),
  })
  .openapi({ ref: 'EventLeaderboardEntry' });

export const EventParticipantSchema = z
  .object({
    userId: z.string().uuid(),
    address: z.string(),
    nickname: z.string().nullable(),
    status: z.string(),
    joinedAt: z.string().datetime(),
    finalRank: z.number().int().nullable(),
    prizeAmount: z.string().nullable(),
  })
  .openapi({ ref: 'EventParticipant' });
