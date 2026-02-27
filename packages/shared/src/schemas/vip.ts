import { z } from 'zod';
import 'zod-openapi/extend';

// ---- Enums ----

export const VipTierSchema = z
  .enum(['silver', 'gold', 'diamond'])
  .openapi({ description: 'VIP subscription tier' });

// ---- Request schemas ----

export const PurchaseVipRequestSchema = z.object({
  tier: VipTierSchema,
}).openapi({ ref: 'PurchaseVipRequest' });

export const BoostBetRequestSchema = z.object({
  betId: z.string().openapi({ description: 'Bet ID to boost' }),
}).openapi({ ref: 'BoostBetRequest' });

export const PinBetRequestSchema = z.object({
  betId: z.string().openapi({ description: 'Bet ID to pin' }),
  slot: z.number().int().min(1).max(3).openapi({ description: 'Pin slot (1-3)' }),
}).openapi({ ref: 'PinBetRequest' });

// ---- Response schemas ----

export const VipConfigResponseSchema = z
  .object({
    tiers: z.array(
      z.object({
        tier: VipTierSchema,
        price: z.string(),
        isActive: z.boolean(),
      }),
    ),
  })
  .openapi({ ref: 'VipConfigResponse' });

export const VipStatusResponseSchema = z
  .object({
    active: z.boolean(),
    tier: VipTierSchema.nullable(),
    expiresAt: z.string().nullable(),
    boostsUsedToday: z.number().int(),
    boostLimit: z.number().int().nullable(), // null = unlimited
  })
  .openapi({ ref: 'VipStatusResponse' });

export const PinSlotResponseSchema = z
  .object({
    slot: z.number().int(),
    betId: z.string().nullable(),
    userId: z.string().nullable(),
    userAddress: z.string().nullable(),
    userNickname: z.string().nullable(),
    price: z.string(),
    outbidPrice: z.string(), // price to outbid this slot
    pinnedAt: z.string().nullable(),
  })
  .openapi({ ref: 'PinSlotResponse' });

export const PinSlotsResponseSchema = z
  .object({
    slots: z.array(PinSlotResponseSchema),
  })
  .openapi({ ref: 'PinSlotsResponse' });

// ---- Admin schemas ----

export const AdminGrantVipRequestSchema = z.object({
  userId: z.string().uuid(),
  tier: VipTierSchema,
  days: z.number().int().min(1).max(365).default(30),
}).openapi({ ref: 'AdminGrantVipRequest' });

export const AdminUpdateVipConfigRequestSchema = z.object({
  tier: VipTierSchema,
  price: z.string().openapi({ description: 'Price in micro-COIN' }),
  isActive: z.boolean().optional(),
}).openapi({ ref: 'AdminUpdateVipConfigRequest' });
