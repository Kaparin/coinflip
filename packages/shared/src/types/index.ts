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
  JackpotPoolResponseSchema,
  JackpotEligibilityResponseSchema,
  TournamentResponseSchema,
  TournamentTeamResponseSchema,
  TournamentLeaderboardEntrySchema,
  TournamentIndividualEntrySchema,
  TournamentJoinRequestResponseSchema,
  TournamentNotificationResponseSchema,
  TournamentResultsSchema,
  CreateTournamentRequestSchema,
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

// ---- Jackpot types ----
export type JackpotPoolResponse = z.infer<typeof JackpotPoolResponseSchema>;
export type JackpotEligibilityResponse = z.infer<typeof JackpotEligibilityResponseSchema>;
export type JackpotTierName = 'mini' | 'medium' | 'large' | 'mega' | 'super_mega';
export type JackpotPoolStatus = 'filling' | 'drawing' | 'completed';

// ---- Enum types ----
export type BetStatus = 'open' | 'accepting' | 'accepted' | 'revealed' | 'canceled' | 'timeout_claimed';
export type Side = 'heads' | 'tails';
export type EventType = 'contest' | 'raffle';
export type EventStatus = 'draft' | 'active' | 'calculating' | 'completed' | 'archived';
export type ContestMetric = 'turnover' | 'wins' | 'profit';

// ---- Tournament types ----
export type TournamentResponse = z.infer<typeof TournamentResponseSchema>;
export type TournamentTeamResponse = z.infer<typeof TournamentTeamResponseSchema>;
export type TournamentLeaderboardEntry = z.infer<typeof TournamentLeaderboardEntrySchema>;
export type TournamentIndividualEntry = z.infer<typeof TournamentIndividualEntrySchema>;
export type TournamentJoinRequestResponse = z.infer<typeof TournamentJoinRequestResponseSchema>;
export type TournamentNotificationResponse = z.infer<typeof TournamentNotificationResponseSchema>;
export type TournamentResults = z.infer<typeof TournamentResultsSchema>;
export type CreateTournamentRequest = z.infer<typeof CreateTournamentRequestSchema>;
export type TournamentStatus = 'draft' | 'registration' | 'active' | 'calculating' | 'completed' | 'canceled' | 'archived';
export type TournamentNotificationType = 'registration_open' | 'registration_closing' | 'started' | 'last_day' | 'ending_soon' | 'ended' | 'results';

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
  | 'event_results_published'
  | 'event_canceled'
  | 'event_archived'
  | 'jackpot_updated'
  | 'jackpot_won'
  | 'jackpot_reset'
  | 'deposit_confirmed'
  | 'deposit_failed'
  | 'withdraw_confirmed'
  | 'withdraw_failed'
  | 'bet_message'
  | 'announcement'
  | 'purchase_confirmed'
  | 'purchase_failed'
  | 'chat_message'
  | 'coin_drop_claimed'
  | 'coin_transfer'
  | 'online_count'
  | 'ai_commentary'
  | 'tournament_score_update'
  | 'tournament_notification'
  | 'tournament_team_update'
  | 'tournament_started'
  | 'tournament_ended'
  | 'tournament_results'
  | 'tournament_canceled';

export type WsEvent = {
  type: WsEventType;
  data: Record<string, unknown>;
  timestamp: number;
};
