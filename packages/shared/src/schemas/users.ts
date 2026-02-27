import { z } from 'zod';
import 'zod-openapi/extend';
import { AddressSchema, AmountSchema } from './common.js';

// ---- User profile ----
export const UserProfileResponseSchema = z
  .object({
    address: AddressSchema,
    nickname: z.string().nullable().openapi({ description: 'Display name' }),
    avatar_url: z.string().url().nullable().openapi({ description: 'Avatar image URL' }),
    stats: z.object({
      total_bets: z.number().int().openapi({ description: 'Total bets placed', example: 42 }),
      wins: z.number().int().openapi({ description: 'Total wins', example: 25 }),
      losses: z.number().int().openapi({ description: 'Total losses', example: 17 }),
      total_wagered: AmountSchema.openapi({ description: 'Total COIN wagered', example: '5000' }),
      total_won: AmountSchema.openapi({ description: 'Total COIN won', example: '3200' }),
    }),
    authz_enabled: z.boolean().openapi({ description: '1-click mode active' }),
    authz_expires_at: z.string().datetime().nullable().openapi({ description: 'Authz grant expiration' }),
    fee_sponsored: z.boolean().openapi({ description: 'Gas sponsorship active' }),
  })
  .openapi({ ref: 'UserProfile' });

// ---- Leaderboard entry ----
export const LeaderboardEntrySchema = z
  .object({
    rank: z.number().int().openapi({ example: 1 }),
    address: AddressSchema,
    nickname: z.string().nullable(),
    wins: z.number().int(),
    total_wagered: AmountSchema,
    win_rate: z.number().openapi({ description: 'Win rate 0-1', example: 0.65 }),
  })
  .openapi({ ref: 'LeaderboardEntry' });
