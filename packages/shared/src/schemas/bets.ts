import { z } from 'zod';
import 'zod-openapi/extend';
import { AmountSchema, SideSchema, BetIdSchema } from './common.js';

// ---- Create bet ----
export const CreateBetRequestSchema = z
  .object({
    amount: AmountSchema.openapi({ description: 'Bet amount in LAUNCH tokens', example: '100' }),
  })
  .openapi({ ref: 'CreateBetRequest' });

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
