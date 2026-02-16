import { z } from 'zod';

/** POST /api/v1/admin/treasury/withdraw */
export const TreasuryWithdrawRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a numeric string'),
});

/** GET /api/v1/admin/treasury/ledger query params */
export const TreasuryLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
