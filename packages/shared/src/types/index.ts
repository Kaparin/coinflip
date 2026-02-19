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
  EventResponseSchema,
  EventLeaderboardEntrySchema,
  CreateEventRequestSchema,
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

// ---- Event types ----
export type EventResponse = z.infer<typeof EventResponseSchema>;
export type EventLeaderboardEntry = z.infer<typeof EventLeaderboardEntrySchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

// ---- Enum types ----
export type BetStatus = 'open' | 'accepting' | 'accepted' | 'revealed' | 'canceled' | 'timeout_claimed';
export type Side = 'heads' | 'tails';
export type EventType = 'contest' | 'raffle';
export type EventStatus = 'draft' | 'active' | 'calculating' | 'completed' | 'archived';
export type ContestMetric = 'turnover' | 'wins' | 'profit';

// ---- WebSocket event types ----
export type WsEventType =
  | 'bet_created'
  | 'bet_confirmed'
  | 'bet_accepting'
  | 'bet_accepted'
  | 'bet_revealed'
  | 'bet_canceling'
  | 'bet_canceled'
  | 'bet_timeout_claimed'
  | 'bet_create_failed'
  | 'accept_failed'
  | 'bet_reverted'
  | 'balance_updated'
  | 'event_started'
  | 'event_ended'
  | 'event_results_published';

export type WsEvent = {
  type: WsEventType;
  data: Record<string, unknown>;
  timestamp: number;
};
