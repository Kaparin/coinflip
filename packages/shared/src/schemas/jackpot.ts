import { z } from 'zod';
import 'zod-openapi/extend';

// ---- Enums ----

export const JackpotTierNameSchema = z
  .enum(['mini', 'medium', 'large', 'mega', 'super_mega'])
  .openapi({ description: 'Jackpot tier name' });

export const JackpotPoolStatusSchema = z
  .enum(['filling', 'drawing', 'completed'])
  .openapi({ description: 'Jackpot pool lifecycle status' });

// ---- Response schemas ----

export const JackpotTierResponseSchema = z
  .object({
    id: z.number().int(),
    name: JackpotTierNameSchema,
    targetAmount: z.string(),
    minGames: z.number().int(),
    contributionBps: z.number().int(),
  })
  .openapi({ ref: 'JackpotTierResponse' });

export const JackpotPoolResponseSchema = z
  .object({
    id: z.string().uuid(),
    tierId: z.number().int(),
    tierName: JackpotTierNameSchema,
    cycle: z.number().int(),
    currentAmount: z.string(),
    targetAmount: z.string(),
    progress: z.number(), // 0-100 percentage
    status: JackpotPoolStatusSchema,
    winnerAddress: z.string().nullable(),
    winnerNickname: z.string().nullable().optional(),
    drawSeed: z.string().nullable(),
    winnerDrawnAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi({ ref: 'JackpotPoolResponse' });

export const JackpotHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const JackpotEligibilityResponseSchema = z
  .object({
    totalBets: z.number().int(),
    eligibleTiers: z.array(z.number().int()),
  })
  .openapi({ ref: 'JackpotEligibilityResponse' });
