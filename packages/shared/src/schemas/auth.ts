import { z } from 'zod';
import 'zod-openapi/extend';
import { AddressSchema } from './common.js';

// ---- Connect wallet / register session ----
export const ConnectRequestSchema = z
  .object({
    address: AddressSchema.openapi({ description: 'User wallet address' }),
    signature: z.string().openapi({ description: 'Signed message proving ownership' }),
    message: z.string().openapi({ description: 'Original signed message' }),
  })
  .openapi({ ref: 'ConnectRequest' });

// ---- Grant status response ----
export const GrantStatusResponseSchema = z
  .object({
    authz_granted: z.boolean().openapi({ description: 'Authz grant exists and is valid' }),
    authz_expires_at: z.string().datetime().nullable(),
    authz_calls_remaining: z.number().int().nullable(),
    fee_grant_active: z.boolean().openapi({ description: 'Feegrant is active' }),
    fee_grant_daily_remaining: z.string().nullable().openapi({ description: 'Remaining daily fee allowance' }),
  })
  .openapi({ ref: 'GrantStatus' });
