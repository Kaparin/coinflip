import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { eventsService } from '../services/events.service.js';
import { sponsoredRaffleService } from '../services/sponsored-raffle.service.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../types.js';

export const eventsRouter = new Hono<AppEnv>();

/** Get userId from context if optionalAuthMiddleware resolved a user */
function tryGetUserId(c: { get: (key: string) => unknown }): string | undefined {
  return (c.get('user') as { id: string } | undefined)?.id;
}

// ---- Public endpoints (with optional auth for hasJoined) ----

// GET /events/active — Active + upcoming events
// Sponsored raffles with startsAt > 1hr from now are only visible to their creator.
eventsRouter.get('/active', optionalAuthMiddleware, async (c) => {
  const userId = tryGetUserId(c);
  const allEvents = await eventsService.getPublicActiveEvents();
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

  // Filter: sponsored drafts with startsAt > 1hr → only creator sees them
  const visibleEvents = allEvents.filter(e => {
    if (!e.userId) return true; // non-sponsored → always visible
    if (e.status === 'draft' && e.startsAt > oneHourFromNow) {
      return e.userId === userId; // only creator sees it
    }
    return true;
  });

  // Format each event independently — one failing event shouldn't break the entire list
  const data: unknown[] = [];
  for (const e of visibleEvents) {
    try {
      data.push(await eventsService.formatEventResponse(e, userId));
    } catch (err) {
      logger.error({ err, eventId: e.id }, 'Failed to format event response, skipping');
    }
  }
  return c.json({ data });
});

// GET /events/completed — Completed events with pagination
const CompletedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/completed', optionalAuthMiddleware, zValidator('query', CompletedQuerySchema), async (c) => {
  const userId = tryGetUserId(c);
  const { limit, offset } = c.req.valid('query');
  const completedEvents = await eventsService.getCompletedEvents(limit, offset);
  const data: unknown[] = [];
  for (const e of completedEvents) {
    try {
      data.push(await eventsService.formatEventResponse(e, userId));
    } catch (err) {
      logger.error({ err, eventId: e.id }, 'Failed to format event response, skipping');
    }
  }
  return c.json({ data });
});

// ---- Sponsored raffle endpoints (must be before /:id to avoid collision) ----

// GET /events/sponsored/config — Public config for the form
eventsRouter.get('/sponsored/config', async (c) => {
  const config = await sponsoredRaffleService.getConfig();
  return c.json({ data: config });
});

// POST /events/sponsored — Submit a sponsored raffle (auth required)
const SubmitSponsoredRaffleSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(3).max(500),
  prizeAmount: z.string().regex(/^\d+$/, 'Must be a numeric string'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

eventsRouter.post('/sponsored', authMiddleware, zValidator('json', SubmitSponsoredRaffleSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await sponsoredRaffleService.submitSponsored(
    user.id,
    body.title,
    body.description,
    body.prizeAmount,
    body.startsAt,
    body.endsAt,
  );
  return c.json({ data: result }, 201);
});

// POST /events/sponsored/:id/cancel — Creator cancels their raffle (full refund)
eventsRouter.post('/sponsored/:id/cancel', authMiddleware, async (c) => {
  const eventId = c.req.param('id');
  const user = c.get('user');
  const result = await sponsoredRaffleService.cancelSponsored(eventId, user.id);
  return c.json({ data: result });
});

// PUT /events/sponsored/:id — Creator edits their raffle (startsAt, endsAt)
const UpdateSponsoredSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

eventsRouter.put('/sponsored/:id', authMiddleware, zValidator('json', UpdateSponsoredSchema), async (c) => {
  const eventId = c.req.param('id');
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await sponsoredRaffleService.updateSponsored(eventId, user.id, body);
  return c.json({ data: result });
});

// ---- Public event details ----

// GET /events/:id — Event details
eventsRouter.get('/:id', optionalAuthMiddleware, async (c) => {
  const eventId = c.req.param('id');
  const userId = tryGetUserId(c);
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  // Hide drafts that aren't upcoming (past drafts that were never activated)
  if (event.status === 'draft' && event.startsAt < new Date()) {
    throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  }
  // Sponsored drafts > 1hr before start → only creator can view
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  if (event.userId && event.status === 'draft' && event.startsAt > oneHourFromNow && event.userId !== userId) {
    throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  }

  const data = await eventsService.formatEventResponse(event, userId);
  return c.json({ data });
});

// GET /events/:id/leaderboard — Contest leaderboard
const LeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/:id/leaderboard', zValidator('query', LeaderboardQuerySchema), async (c) => {
  const eventId = c.req.param('id');
  const { limit, offset } = c.req.valid('query');
  try {
    const { data, total } = await eventsService.getContestLeaderboard(eventId, limit, offset);
    return c.json({ data, total });
  } catch (err) {
    logger.error({ err, eventId }, 'Leaderboard query failed');
    return c.json({ data: [], total: 0 });
  }
});

// GET /events/:id/participants — Raffle participants
const ParticipantsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/:id/participants', zValidator('query', ParticipantsQuerySchema), async (c) => {
  const eventId = c.req.param('id');
  const { limit, offset } = c.req.valid('query');
  try {
    const data = await eventsService.getParticipants(eventId, limit, offset);
    return c.json({ data });
  } catch (err) {
    logger.error({ err, eventId }, 'Participants query failed');
    return c.json({ data: [] });
  }
});

// GET /events/:id/results — Final results
eventsRouter.get('/:id/results', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  try {
    const winners = await eventsService.getWinnersForDistribution(eventId);
    return c.json({
      data: {
        results: event.results,
        raffleSeed: event.raffleSeed,
        winners,
      },
    });
  } catch (err) {
    logger.error({ err, eventId }, 'Results query failed');
    return c.json({
      data: {
        results: event.results,
        raffleSeed: event.raffleSeed,
        winners: [],
      },
    });
  }
});

// ---- Auth-required endpoints ----

// POST /events/:id/join — Join raffle or opt-in contest
eventsRouter.post('/:id/join', authMiddleware, async (c) => {
  const eventId = c.req.param('id');
  const user = c.get('user');
  const participant = await eventsService.joinEvent(eventId, user.id);
  return c.json({ data: { joined: true, joinedAt: participant?.joinedAt?.toISOString() ?? new Date().toISOString() } });
});

// GET /events/:id/my-status — Current user's participation status
eventsRouter.get('/:id/my-status', authMiddleware, async (c) => {
  const eventId = c.req.param('id');
  const user = c.get('user');

  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  let hasJoined = false;
  let myRank: number | null = null;

  try {
    const config = event.config as Record<string, unknown>;
    const isAutoJoinContest = event.type === 'contest' && config.autoJoin === true;
    hasJoined = isAutoJoinContest
      ? await eventsService.hasUserPlayedDuringEvent(event, user.id)
      : await eventsService.hasUserJoined(eventId, user.id);
  } catch (err) {
    logger.error({ err, eventId, userId: user.id }, 'hasJoined check failed in my-status');
  }

  try {
    myRank = event.type === 'contest'
      ? await eventsService.getUserRank(eventId, user.id)
      : null;
  } catch (err) {
    logger.error({ err, eventId, userId: user.id }, 'getUserRank failed in my-status');
  }

  return c.json({
    data: {
      hasJoined,
      myRank,
    },
  });
});

// GET /events/:id/debug — Diagnostic endpoint (admin only)
eventsRouter.get('/:id/debug', adminMiddleware, async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const config = event.config as Record<string, unknown>;
  const isAutoJoinContest = event.type === 'contest' && config.autoJoin === true;
  const db = getDb();

  const diagnostics: Record<string, unknown> = {
    eventId,
    type: event.type,
    status: event.status,
    startsAt: event.startsAt?.toISOString?.() ?? String(event.startsAt),
    endsAt: event.endsAt?.toISOString?.() ?? String(event.endsAt),
    config,
    isAutoJoinContest,
    startsAtType: typeof event.startsAt,
    endsAtType: typeof event.endsAt,
    startsAtIsDate: event.startsAt instanceof Date,
    endsAtIsDate: event.endsAt instanceof Date,
  };

  // Raw SQL to count bets in the time range
  try {
    const startsAtStr = event.startsAt.toISOString();
    const endsAtStr = event.endsAt.toISOString();
    const betCount = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(CASE WHEN status IN ('revealed', 'timeout_claimed') THEN 1 END)::int AS resolved,
             MIN(created_time) AS first_bet,
             MAX(created_time) AS last_bet
      FROM bets
      WHERE created_time >= ${startsAtStr}::timestamptz
        AND created_time <= ${endsAtStr}::timestamptz
    `);
    diagnostics.betsInRange = (betCount as unknown as unknown[])[0];
  } catch (err) {
    diagnostics.betsInRangeError = err instanceof Error ? err.message : String(err);
  }

  // Player count via getAutoJoinPlayerCount
  try {
    diagnostics.autoJoinPlayerCount = await eventsService.getAutoJoinPlayerCount(event);
  } catch (err) {
    diagnostics.autoJoinPlayerCountError = err instanceof Error ? err.message : String(err);
  }

  // Participant count via getParticipantCount (event_participants table)
  try {
    diagnostics.eventParticipantCount = await eventsService.getParticipantCount(eventId);
  } catch (err) {
    diagnostics.eventParticipantCountError = err instanceof Error ? err.message : String(err);
  }

  // Leaderboard
  try {
    const lb = await eventsService.getContestLeaderboard(eventId, 10, 0);
    diagnostics.leaderboard = lb;
  } catch (err) {
    diagnostics.leaderboardError = err instanceof Error ? err.message : String(err);
  }

  // formatEventResponse
  try {
    diagnostics.formattedResponse = await eventsService.formatEventResponse(event);
  } catch (err) {
    diagnostics.formatError = err instanceof Error ? err.message : String(err);
  }

  return c.json({ data: diagnostics });
});
