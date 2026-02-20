import { createDocument } from 'zod-openapi';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import 'zod-openapi/extend';
import {
  CreateBetRequestSchema,
  AcceptBetRequestSchema,
  RevealRequestSchema,
  DepositRequestSchema,
  WithdrawRequestSchema,
  VaultBalanceResponseSchema,
  UserProfileResponseSchema,
  LeaderboardEntrySchema,
  BetResponseSchema,
  ErrorResponseSchema,
  ConnectRequestSchema,
  GrantStatusResponseSchema,
  EventResponseSchema,
  EventLeaderboardEntrySchema,
  EventParticipantSchema,
  CreateEventRequestSchema,
  UpdateEventRequestSchema,
} from '@coinflip/shared/schemas';

// Wrapper helpers
const success = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema });
const paginated = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: z.array(schema),
    cursor: z.string().nullable(),
    has_more: z.boolean(),
  });

const document = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Heads or Tails PvP dApp API',
    version: '1.0.0',
    description:
      'API for the PvP Heads or Tails decentralized application on Axiome Chain. Enables creating, accepting, revealing, and resolving Heads/Tails bets with LAUNCH tokens.',
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
    { url: 'https://coinflipapi-production.up.railway.app', description: 'Production' },
  ],
  paths: {
    // ---- Bets ----
    '/api/v1/bets': {
      get: {
        tags: ['Bets'],
        summary: 'List open bets',
        operationId: 'getBets',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'accepting', 'accepted', 'revealed', 'canceled', 'timeout_claimed'] } },
          { name: 'min_amount', in: 'query', schema: { type: 'string' } },
          { name: 'max_amount', in: 'query', schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Paginated list of bets',
            content: { 'application/json': { schema: paginated(BetResponseSchema) } },
          },
        },
      },
      post: {
        tags: ['Bets'],
        summary: 'Create a new bet',
        operationId: 'createBet',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: CreateBetRequestSchema } },
        },
        responses: {
          201: {
            description: 'Bet created',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
          422: {
            description: 'Validation error',
            content: { 'application/json': { schema: ErrorResponseSchema } },
          },
        },
      },
    },

    '/api/v1/bets/history': {
      get: {
        tags: ['Bets'],
        summary: 'Get bet history',
        operationId: 'getBetHistory',
        parameters: [
          { name: 'address', in: 'query', schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'Paginated bet history',
            content: { 'application/json': { schema: paginated(BetResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/bets/{betId}': {
      get: {
        tags: ['Bets'],
        summary: 'Get bet details',
        operationId: 'getBetById',
        parameters: [
          { name: 'betId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Bet details',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
          404: {
            description: 'Bet not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
          },
        },
      },
    },

    '/api/v1/bets/{betId}/accept': {
      post: {
        tags: ['Bets'],
        summary: 'Accept an open bet',
        operationId: 'acceptBet',
        parameters: [
          { name: 'betId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: AcceptBetRequestSchema } },
        },
        responses: {
          200: {
            description: 'Bet accepted',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/bets/{betId}/reveal': {
      post: {
        tags: ['Bets'],
        summary: 'Reveal commitment for accepted bet',
        operationId: 'revealBet',
        parameters: [
          { name: 'betId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: RevealRequestSchema } },
        },
        responses: {
          200: {
            description: 'Bet revealed and resolved',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/bets/{betId}/cancel': {
      post: {
        tags: ['Bets'],
        summary: 'Cancel an open bet',
        operationId: 'cancelBet',
        parameters: [
          { name: 'betId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Bet canceled',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/bets/{betId}/claim-timeout': {
      post: {
        tags: ['Bets'],
        summary: 'Claim timeout on unrevealed bet',
        operationId: 'claimTimeout',
        parameters: [
          { name: 'betId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Timeout claimed, acceptor wins',
            content: { 'application/json': { schema: success(BetResponseSchema) } },
          },
        },
      },
    },

    // ---- Vault ----
    '/api/v1/vault/balance': {
      get: {
        tags: ['Vault'],
        summary: 'Get current vault balance',
        operationId: 'getVaultBalance',
        responses: {
          200: {
            description: 'Vault balance',
            content: { 'application/json': { schema: success(VaultBalanceResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/vault/deposit': {
      post: {
        tags: ['Vault'],
        summary: 'Initiate deposit (returns Axiome Connect payload)',
        operationId: 'depositToVault',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: DepositRequestSchema } },
        },
        responses: {
          200: { description: 'Deposit payload for Axiome Connect' },
        },
      },
    },

    '/api/v1/vault/withdraw': {
      post: {
        tags: ['Vault'],
        summary: 'Withdraw LAUNCH from vault',
        operationId: 'withdrawFromVault',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: WithdrawRequestSchema } },
        },
        responses: {
          200: { description: 'Withdraw initiated' },
        },
      },
    },

    // ---- Users ----
    '/api/v1/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get current user profile',
        operationId: 'getCurrentUser',
        responses: {
          200: {
            description: 'User profile',
            content: { 'application/json': { schema: success(UserProfileResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/users/{address}': {
      get: {
        tags: ['Users'],
        summary: 'Get public user profile',
        operationId: 'getUserByAddress',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Public profile',
            content: { 'application/json': { schema: success(UserProfileResponseSchema) } },
          },
        },
      },
    },

    '/api/v1/leaderboard': {
      get: {
        tags: ['Users'],
        summary: 'Get leaderboard',
        operationId: 'getLeaderboard',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            description: 'Leaderboard entries',
            content: { 'application/json': { schema: paginated(LeaderboardEntrySchema) } },
          },
        },
      },
    },

    // ---- Auth ----
    '/api/v1/auth/connect': {
      post: {
        tags: ['Auth'],
        summary: 'Connect wallet and register session',
        operationId: 'connectWallet',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ConnectRequestSchema } },
        },
        responses: {
          200: { description: 'Session created' },
        },
      },
    },

    '/api/v1/auth/grants': {
      get: {
        tags: ['Auth'],
        summary: 'Check authz and feegrant status',
        operationId: 'getGrantStatus',
        responses: {
          200: {
            description: 'Grant status',
            content: { 'application/json': { schema: success(GrantStatusResponseSchema) } },
          },
        },
      },
    },

    // ---- Events ----
    '/api/v1/events/active': {
      get: {
        tags: ['Events'],
        summary: 'List active events',
        operationId: 'getActiveEvents',
        responses: {
          200: {
            description: 'Active events list',
            content: { 'application/json': { schema: success(z.array(EventResponseSchema)) } },
          },
        },
      },
    },

    '/api/v1/events/completed': {
      get: {
        tags: ['Events'],
        summary: 'List completed events',
        operationId: 'getCompletedEvents',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'Completed events list',
            content: { 'application/json': { schema: success(z.array(EventResponseSchema)) } },
          },
        },
      },
    },

    '/api/v1/events/{eventId}': {
      get: {
        tags: ['Events'],
        summary: 'Get event details',
        operationId: 'getEventById',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Event details',
            content: { 'application/json': { schema: success(EventResponseSchema) } },
          },
          404: {
            description: 'Event not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
          },
        },
      },
    },

    '/api/v1/events/{eventId}/leaderboard': {
      get: {
        tags: ['Events'],
        summary: 'Get contest leaderboard',
        operationId: 'getEventLeaderboard',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'Leaderboard entries',
            content: { 'application/json': { schema: z.object({ data: z.array(EventLeaderboardEntrySchema), total: z.number() }) } },
          },
        },
      },
    },

    '/api/v1/events/{eventId}/participants': {
      get: {
        tags: ['Events'],
        summary: 'Get raffle participants',
        operationId: 'getEventParticipants',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'Participants list',
            content: { 'application/json': { schema: success(z.array(EventParticipantSchema)) } },
          },
        },
      },
    },

    '/api/v1/events/{eventId}/results': {
      get: {
        tags: ['Events'],
        summary: 'Get event results',
        operationId: 'getEventResults',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Event results',
          },
        },
      },
    },

    '/api/v1/events/{eventId}/join': {
      post: {
        tags: ['Events'],
        summary: 'Join event (raffle or opt-in contest)',
        operationId: 'joinEvent',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Joined successfully',
          },
        },
      },
    },

    '/api/v1/events/{eventId}/my-status': {
      get: {
        tags: ['Events'],
        summary: 'Get current user event status',
        operationId: 'getMyEventStatus',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'User participation status',
          },
        },
      },
    },
  },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../openapi.json');
writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf-8');

console.log(`OpenAPI spec written to ${outPath}`);
