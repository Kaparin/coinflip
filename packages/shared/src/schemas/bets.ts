import { z } from 'zod';
import 'zod-openapi/extend';
import { AmountSchema, SideSchema, BetIdSchema } from './common.js';
import { MAX_BATCH_SIZE, MIN_BATCH_SIZE } from '../constants.js';

// ---- Create bet ----
export const CreateBetRequestSchema = z
  .object({
    amount: AmountSchema.openapi({ description: 'Bet amount in LAUNCH tokens', example: '100' }),
  })
  .openapi({ ref: 'CreateBetRequest' });

// ---- Batch create bets ----
export const BatchCreateBetsRequestSchema = z
  .object({
    mode: z.enum(['fixed', 'random']).openapi({
      description: '"fixed" = all bets use the same amount; "random" = each bet gets a random amount between min_amount and max_amount',
    }),
    count: z.coerce.number().int().min(MIN_BATCH_SIZE).max(MAX_BATCH_SIZE).openapi({
      description: `Number of bets to create (${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE})`,
      example: 5,
    }),
    amount: AmountSchema.optional().openapi({
      description: 'Fixed amount per bet (required when mode="fixed")',
      example: '100000000',
    }),
    min_amount: AmountSchema.optional().openapi({
      description: 'Minimum random amount (required when mode="random")',
      example: '1000000',
    }),
    max_amount: AmountSchema.optional().openapi({
      description: 'Maximum random amount (required when mode="random")',
      example: '100000000',
    }),
  })
  .refine(
    (data) => {
      if (data.mode === 'fixed') return !!data.amount;
      return !!data.min_amount && !!data.max_amount;
    },
    { message: 'Fixed mode requires "amount"; random mode requires "min_amount" and "max_amount"' },
  )
  .refine(
    (data) => {
      if (data.mode === 'random' && data.min_amount && data.max_amount) {
        return BigInt(data.max_amount) >= BigInt(data.min_amount);
      }
      return true;
    },
    { message: 'max_amount must be >= min_amount' },
  )
  .openapi({ ref: 'BatchCreateBetsRequest' });

// ---- Accept bet ----
export const AcceptBetRequestSchema = z
  .object({
    guess: SideSchema.openapi({ description: 'Acceptor guess: heads or tails' }),
  })
  .openapi({ ref: 'AcceptBetRequest' });

// ---- Reveal ----
export const RevealRequestSchema = z
  .object({
    side: SideSchema.openapi({ description: 'Maker original chosen side' }),
    secret: z
      .string()
      .length(64)
      .openapi({ description: 'Original secret (64 hex chars = 32 bytes)' }),
  })
  .openapi({ ref: 'RevealRequest' });

// ---- Cancel bet ----
export const CancelBetRequestSchema = z.object({}).openapi({ ref: 'CancelBetRequest' });

// ---- Claim timeout ----
export const ClaimTimeoutRequestSchema = z.object({}).openapi({ ref: 'ClaimTimeoutRequest' });
