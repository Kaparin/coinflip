import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { eventsService } from '../services/events.service.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export const eventsRouter = new Hono<AppEnv>();

// ---- Public endpoints ----

// GET /events/active — Active + upcoming events
eventsRouter.get('/active', async (c) => {
  const activeEvents = await eventsService.getPublicActiveEvents();
  const data = await Promise.all(activeEvents.map((e) => eventsService.formatEventResponse(e)));
  return c.json({ data });
});

// GET /events/completed — Completed events with pagination
const CompletedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/completed', zValidator('query', CompletedQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const completedEvents = await eventsService.getCompletedEvents(limit, offset);
  const data = await Promise.all(completedEvents.map((e) => eventsService.formatEventResponse(e)));
  return c.json({ data });
});

// GET /events/:id — Event details
eventsRouter.get('/:id', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status === 'draft') throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  const data = await eventsService.formatEventResponse(event);
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
  const { data, total } = await eventsService.getContestLeaderboard(eventId, limit, offset);
  return c.json({ data, total });
});

// GET /events/:id/participants — Raffle participants
const ParticipantsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

eventsRouter.get('/:id/participants', zValidator('query', ParticipantsQuerySchema), async (c) => {
  const eventId = c.req.param('id');
  const { limit, offset } = c.req.valid('query');
  const data = await eventsService.getParticipants(eventId, limit, offset);
  return c.json({ data });
});

// GET /events/:id/results — Final results
eventsRouter.get('/:id/results', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  const winners = await eventsService.getWinnersForDistribution(eventId);
  return c.json({
    data: {
      results: event.results,
      raffleSeed: event.raffleSeed,
      winners,
    },
  });
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

  const hasJoined = await eventsService.hasUserJoined(eventId, user.id);
  const myRank = event.type === 'contest'
    ? await eventsService.getUserRank(eventId, user.id)
    : null;

  return c.json({
    data: {
      hasJoined,
      myRank,
    },
  });
});
