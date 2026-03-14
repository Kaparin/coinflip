import { z } from 'zod';
import 'zod-openapi/extend';
import { AmountSchema } from './common.js';

// ---- Enums ----

export const TournamentStatusSchema = z
  .enum(['draft', 'registration', 'active', 'calculating', 'completed', 'canceled', 'archived'])
  .openapi({ description: 'Tournament lifecycle status' });

export const TournamentNotificationTypeSchema = z
  .enum(['registration_open', 'registration_closing', 'started', 'last_day', 'ending_soon', 'ended', 'results'])
  .openapi({ description: 'Tournament notification type' });

export const JoinRequestStatusSchema = z
  .enum(['pending', 'approved', 'rejected'])
  .openapi({ description: 'Team join request status' });

// ---- Config schemas ----

export const ScoringTierSchema = z
  .object({
    minAmount: AmountSchema.openapi({ description: 'Minimum bet amount in uaxm (inclusive)' }),
    maxAmount: AmountSchema.openapi({ description: 'Maximum bet amount in uaxm (inclusive)' }),
    winPoints: z.number().int().min(1).openapi({ description: 'Points awarded for a win' }),
    lossPoints: z.number().int().min(0).openapi({ description: 'Points awarded for a loss' }),
  })
  .openapi({ ref: 'ScoringTier' });

export const ScoringConfigSchema = z
  .object({
    tiers: z.array(ScoringTierSchema).min(1).openapi({ description: 'Point tiers based on bet size' }),
  })
  .openapi({ ref: 'ScoringConfig' });

export const TeamConfigSchema = z
  .object({
    minSize: z.number().int().min(1).default(1).openapi({ description: 'Minimum team size' }),
    maxSize: z.number().int().min(1).default(10).openapi({ description: 'Maximum team size' }),
  })
  .openapi({ ref: 'TeamConfig' });

export const PrizeDistributionEntrySchema = z
  .object({
    place: z.number().int().min(1).openapi({ description: 'Team place (1st, 2nd, etc.)' }),
    percent: z.number().min(0).max(100).openapi({ description: 'Percentage of total prize pool' }),
  })
  .openapi({ ref: 'PrizeDistributionEntry' });

// ---- Request schemas ----

export const CreateTournamentRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    entryFee: AmountSchema.openapi({ description: 'Entry fee in uaxm' }),
    commissionBps: z.number().int().min(0).max(2000).default(0).openapi({ description: 'Commission in BPS (0-2000)' }),
    bonusPool: AmountSchema.optional().openapi({ description: 'Admin bonus to prize pool in uaxm' }),
    prizeDistribution: z.array(PrizeDistributionEntrySchema).min(1),
    scoringConfig: ScoringConfigSchema,
    teamConfig: TeamConfigSchema.optional(),
    maxParticipants: z.number().int().min(1).optional(),
    registrationStartsAt: z.string().datetime(),
    registrationEndsAt: z.string().datetime(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .openapi({ ref: 'CreateTournamentRequest' });

export const UpdateTournamentRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    entryFee: AmountSchema.optional(),
    commissionBps: z.number().int().min(0).max(2000).optional(),
    bonusPool: AmountSchema.optional(),
    prizeDistribution: z.array(PrizeDistributionEntrySchema).min(1).optional(),
    scoringConfig: ScoringConfigSchema.optional(),
    teamConfig: TeamConfigSchema.optional(),
    maxParticipants: z.number().int().min(1).nullable().optional(),
    registrationStartsAt: z.string().datetime().optional(),
    registrationEndsAt: z.string().datetime().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .openapi({ ref: 'UpdateTournamentRequest' });

// ---- Team schemas ----

export const CreateTeamRequestSchema = z
  .object({
    name: z.string().min(1).max(50),
    description: z.string().max(500).optional(),
    avatarUrl: z.string().max(500).optional(),
    isOpen: z.boolean().default(true),
  })
  .openapi({ ref: 'CreateTeamRequest' });

export const UpdateTeamRequestSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(500).optional(),
    avatarUrl: z.string().max(500).optional(),
    isOpen: z.boolean().optional(),
  })
  .openapi({ ref: 'UpdateTeamRequest' });

// ---- Response schemas ----

export const TournamentResponseSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    titleEn: z.string().nullable(),
    titleRu: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    descriptionRu: z.string().nullable(),
    status: TournamentStatusSchema,
    entryFee: z.string(),
    prizePool: z.string(),
    bonusPool: z.string(),
    totalPrizePool: z.string().openapi({ description: 'prizePool + bonusPool' }),
    commissionBps: z.number().int(),
    prizeDistribution: z.array(PrizeDistributionEntrySchema),
    scoringConfig: ScoringConfigSchema,
    teamConfig: TeamConfigSchema,
    maxParticipants: z.number().int().nullable(),
    participantCount: z.number().int(),
    teamCount: z.number().int(),
    registrationStartsAt: z.string().datetime(),
    registrationEndsAt: z.string().datetime(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    hasPaid: z.boolean().optional(),
    myTeamId: z.string().uuid().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .openapi({ ref: 'TournamentResponse' });

export const TournamentTeamResponseSchema = z
  .object({
    id: z.string().uuid(),
    tournamentId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    captainUserId: z.string().uuid(),
    captainAddress: z.string(),
    captainNickname: z.string().nullable(),
    inviteCode: z.string().nullable(),
    isOpen: z.boolean(),
    totalPoints: z.string(),
    memberCount: z.number().int(),
    maxSize: z.number().int(),
    finalRank: z.number().int().nullable(),
    prizeAmount: z.string().nullable(),
    members: z.array(z.object({
      userId: z.string().uuid(),
      address: z.string(),
      nickname: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      totalPoints: z.string(),
      gamesPlayed: z.number().int(),
      gamesWon: z.number().int(),
      bestStreak: z.number().int(),
      isCaptain: z.boolean(),
    })).optional(),
  })
  .openapi({ ref: 'TournamentTeamResponse' });

export const TournamentLeaderboardEntrySchema = z
  .object({
    rank: z.number().int(),
    teamId: z.string().uuid(),
    teamName: z.string(),
    teamAvatarUrl: z.string().nullable(),
    totalPoints: z.string(),
    memberCount: z.number().int(),
    prizeAmount: z.string().nullable(),
  })
  .openapi({ ref: 'TournamentLeaderboardEntry' });

export const TournamentIndividualEntrySchema = z
  .object({
    rank: z.number().int(),
    userId: z.string().uuid(),
    address: z.string(),
    nickname: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    teamId: z.string().uuid(),
    teamName: z.string(),
    totalPoints: z.string(),
    gamesPlayed: z.number().int(),
    gamesWon: z.number().int(),
    bestStreak: z.number().int(),
  })
  .openapi({ ref: 'TournamentIndividualEntry' });

export const TournamentJoinRequestResponseSchema = z
  .object({
    id: z.string().uuid(),
    teamId: z.string().uuid(),
    userId: z.string().uuid(),
    address: z.string(),
    nickname: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    status: JoinRequestStatusSchema,
    createdAt: z.string().datetime(),
  })
  .openapi({ ref: 'TournamentJoinRequestResponse' });

export const TournamentNotificationResponseSchema = z
  .object({
    id: z.string().uuid(),
    tournamentId: z.string().uuid(),
    type: TournamentNotificationTypeSchema,
    title: z.string(),
    titleEn: z.string().nullable(),
    titleRu: z.string().nullable(),
    message: z.string().nullable(),
    messageEn: z.string().nullable(),
    messageRu: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi({ ref: 'TournamentNotificationResponse' });

export const TournamentResultsSchema = z
  .object({
    teamRankings: z.array(z.object({
      rank: z.number().int(),
      teamId: z.string().uuid(),
      teamName: z.string(),
      totalPoints: z.string(),
      prizeAmount: z.string(),
      members: z.array(z.object({
        userId: z.string().uuid(),
        address: z.string(),
        nickname: z.string().nullable(),
        totalPoints: z.string(),
        gamesPlayed: z.number().int(),
        gamesWon: z.number().int(),
        /** Recommended share based on points proportion */
        recommendedShare: z.string(),
      })),
    })),
  })
  .openapi({ ref: 'TournamentResults' });
