import type { z } from 'zod';
import type {
  CreateBetRequestSchema,
  AcceptBetRequestSchema,
  RevealRequestSchema,
  WithdrawRequestSchema,
  BetResponseSchema,
  VaultBalanceResponseSchema,
  UserProfileResponseSchema,
  ErrorResponseSchema,
  PaginatedResponseSchema,
} from '../schemas/index.js';

// ---- Inferred request types ----
export type CreateBetRequest = z.infer<typeof CreateBetRequestSchema>;
export type AcceptBetRequest = z.infer<typeof AcceptBetRequestSchema>;
export type RevealRequest = z.infer<typeof RevealRequestSchema>;
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;

// ---- Inferred response types ----
export type BetResponse = z.infer<typeof BetResponseSchema>;
export type VaultBalanceResponse = z.infer<typeof VaultBalanceResponseSchema>;
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginatedResponse<T> = z.infer<ReturnType<typeof PaginatedResponseSchema>> & {
  data: T[];
};

// ---- Enum types ----
export type BetStatus = 'open' | 'accepted' | 'revealed' | 'canceled' | 'timeout_claimed';
export type Side = 'heads' | 'tails';

// ---- WebSocket event types ----
export type WsEventType =
  | 'bet_created'
  | 'bet_accepted'
  | 'bet_revealed'
  | 'bet_canceled'
  | 'bet_timeout_claimed'
  | 'balance_updated';

export type WsEvent = {
  type: WsEventType;
  data: Record<string, unknown>;
  timestamp: number;
};
