import { z } from 'zod';
import 'zod-openapi/extend';
import {
  AddressSchema,
  AmountSchema,
  TxHashSchema,
  BetIdSchema,
  SideSchema,
  BetStatusSchema,
  CursorQuerySchema,
} from './common.js';

// ---- Full bet response ----
export const BetResponseSchema = z
  .object({
    id: BetIdSchema,
    maker: AddressSchema,
    maker_nickname: z.string().nullable().openapi({ description: 'Maker display nickname' }),
    amount: AmountSchema,
    status: BetStatusSchema,
    created_at: z.string().datetime().openapi({ description: 'Bet creation time (ISO 8601)' }),
    txhash_create: TxHashSchema,

    // Populated when ACCEPTED+
    acceptor: AddressSchema.nullable().openapi({ description: 'Acceptor address (null if OPEN)' }),
    acceptor_nickname: z.string().nullable().openapi({ description: 'Acceptor display nickname' }),
    acceptor_guess: SideSchema.nullable().openapi({ description: 'Acceptor guess (null if OPEN)' }),
    accepted_at: z.string().datetime().nullable(),
    txhash_accept: TxHashSchema.nullable(),

    // Populated when REVEALED
    reveal_side: SideSchema.nullable().openapi({ description: 'Maker revealed side' }),
    winner: AddressSchema.nullable().openapi({ description: 'Winner address' }),
    winner_nickname: z.string().nullable().openapi({ description: 'Winner display nickname' }),
    payout_amount: AmountSchema.nullable().openapi({ description: 'Winner payout (after commission)' }),
    commission_amount: AmountSchema.nullable(),
    resolved_at: z.string().datetime().nullable(),
    txhash_resolve: TxHashSchema.nullable(),

    // Timeouts
    reveal_deadline: z.string().datetime().nullable().openapi({
      description: 'Deadline for maker to reveal (accepted_at + 5min)',
    }),
    expires_at: z.string().datetime().nullable().openapi({
      description: 'When open bet expires (created_at + TTL)',
    }),
  })
  .openapi({ ref: 'Bet' });

// ---- Bet list query params ----
export const BetListQuerySchema = CursorQuerySchema.extend({
  status: BetStatusSchema.optional().openapi({ description: 'Filter by status' }),
  min_amount: AmountSchema.optional().openapi({ description: 'Min bet amount filter' }),
  max_amount: AmountSchema.optional().openapi({ description: 'Max bet amount filter' }),
}).openapi({ ref: 'BetListQuery' });

// ---- Bet history query ----
export const BetHistoryQuerySchema = CursorQuerySchema.extend({
  address: AddressSchema.optional().openapi({ description: 'Filter by wallet address' }),
}).openapi({ ref: 'BetHistoryQuery' });
