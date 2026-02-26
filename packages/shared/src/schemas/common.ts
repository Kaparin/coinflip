import { z } from 'zod';
import 'zod-openapi/extend';

// ---- Error response ----
export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ description: 'Machine-readable error code', example: 'INSUFFICIENT_BALANCE' }),
      message: z.string().openapi({ description: 'Human-readable error message' }),
      details: z.record(z.unknown()).optional().openapi({ description: 'Additional error details' }),
    }),
  })
  .openapi({ ref: 'ErrorResponse' });

// ---- Success wrapper ----
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  });

// ---- Paginated response wrapper ----
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    cursor: z.string().nullable().openapi({ description: 'Cursor for next page, null if last page' }),
    has_more: z.boolean().openapi({ description: 'Whether there are more items' }),
  });

// ---- Common field schemas ----
export const AddressSchema = z
  .string()
  .min(1)
  .openapi({ description: 'Axiome wallet address', example: 'axm1abc123...' });

export const AmountSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be a numeric string')
  .refine((val) => val.length <= 20, 'Amount exceeds maximum (10^20)')
  .openapi({ description: 'Token amount as string', example: '100' });

export const TxHashSchema = z
  .string()
  .openapi({ description: 'Transaction hash', example: 'A1B2C3D4E5F6...' });

export const BetIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .openapi({ description: 'Unique bet identifier', example: 42 });

export const SideSchema = z
  .enum(['heads', 'tails'])
  .openapi({ description: 'Coin side: heads or tails' });

export const BetStatusSchema = z
  .enum(['open', 'accepting', 'accepted', 'revealed', 'canceled', 'timeout_claimed'])
  .openapi({ description: 'Current bet status' });

export const CursorQuerySchema = z.object({
  cursor: z.string().optional().openapi({ description: 'Pagination cursor' }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ description: 'Items per page' }),
});
