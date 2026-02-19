import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { adminMiddleware } from '../middleware/admin.js';
import { eventsService } from '../services/events.service.js';
import { wsService } from '../services/ws.service.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  CreateEventRequestSchema,
  UpdateEventRequestSchema,
} from '@coinflip/shared/schemas';
import type { AppEnv } from '../types.js';

export const adminEventsRouter = new Hono<AppEnv>();

// All routes require admin
adminEventsRouter.use('*', adminMiddleware);

// GET /admin/events — All events (any status)
const ListQuerySchema = z.object({
  status: z.string().optional(),
});

adminEventsRouter.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const { status } = c.req.valid('query');
  const allEvents = await eventsService.getAllEvents(status);
  const data = await Promise.all(allEvents.map((e) => eventsService.formatEventResponse(e)));
  return c.json({ data });
});

// POST /admin/events — Create event
adminEventsRouter.post('/', zValidator('json', CreateEventRequestSchema), async (c) => {
  const body = c.req.valid('json');
  const address = c.get('address');
  const event = await eventsService.createEvent({ ...body, createdBy: address });
  const data = await eventsService.formatEventResponse(event!);
  return c.json({ data }, 201);
});

// PUT /admin/events/:id — Update event (draft only)
adminEventsRouter.put('/:id', zValidator('json', UpdateEventRequestSchema), async (c) => {
  const eventId = c.req.param('id');
  const body = c.req.valid('json');
  const event = await eventsService.updateEvent(eventId, body);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found or not in draft status', 404);
  const data = await eventsService.formatEventResponse(event);
  return c.json({ data });
});

// DELETE /admin/events/:id — Delete event (draft only)
adminEventsRouter.delete('/:id', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.deleteEvent(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found or not in draft status', 404);
  return c.json({ data: { deleted: true } });
});

// POST /admin/events/:id/activate — draft → active
adminEventsRouter.post('/:id/activate', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'draft') {
    throw new AppError('INVALID_STATE', `Cannot activate event in ${event.status} status`, 400);
  }

  const updated = await eventsService.setStatus(eventId, 'active');
  if (!updated) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  wsService.broadcast({ type: 'event_started', data: { eventId, title: event.title, type: event.type } });
  logger.info({ eventId, title: event.title }, 'Event activated');

  const data = await eventsService.formatEventResponse(updated);
  return c.json({ data });
});

// POST /admin/events/:id/calculate — Trigger calculation (for raffles)
adminEventsRouter.post('/:id/calculate', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  if (event.status !== 'calculating' && event.status !== 'active') {
    throw new AppError('INVALID_STATE', `Event must be active or calculating to trigger calculation`, 400);
  }

  // Move to calculating if still active
  if (event.status === 'active') {
    await eventsService.setStatus(eventId, 'calculating');
  }

  let results;
  if (event.type === 'contest') {
    results = await eventsService.calculateContestResults(eventId);
  } else {
    const drawResult = await eventsService.drawRaffleWinners(eventId);
    results = drawResult?.results;
  }

  const updated = await eventsService.getEventById(eventId);
  const data = updated ? await eventsService.formatEventResponse(updated) : null;
  return c.json({ data: { event: data, results } });
});

// POST /admin/events/:id/approve — calculating → completed
adminEventsRouter.post('/:id/approve', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'calculating') {
    throw new AppError('INVALID_STATE', `Event must be in calculating status to approve`, 400);
  }

  const updated = await eventsService.setStatus(eventId, 'completed');
  if (!updated) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  wsService.broadcast({
    type: 'event_results_published',
    data: { eventId, title: event.title, type: event.type },
  });
  logger.info({ eventId }, 'Event approved → completed');

  const data = await eventsService.formatEventResponse(updated);
  return c.json({ data });
});

// POST /admin/events/:id/distribute — Distribute all prizes via vault credit
adminEventsRouter.post('/:id/distribute', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'completed') {
    throw new AppError('INVALID_STATE', 'Event must be completed to distribute prizes', 400);
  }

  const { distributed, failed } = await eventsService.distributeAllPrizes(eventId);
  const winners = await eventsService.getWinnersForDistribution(eventId);
  const totalDistributed = winners.filter((w) => w.prizeTxHash).length;

  logger.info({ eventId, distributed, failed }, 'Prize distribution completed');

  return c.json({
    data: {
      message: failed > 0
        ? `Distributed ${distributed}, failed ${failed}`
        : `All ${distributed} prizes distributed`,
      total: winners.length,
      distributed: totalDistributed,
      failed,
    },
  });
});

// POST /admin/events/:id/distribute/:userId — Distribute single prize
adminEventsRouter.post('/:id/distribute/:userId', async (c) => {
  const eventId = c.req.param('id');
  const userId = c.req.param('userId');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'completed') {
    throw new AppError('INVALID_STATE', 'Event must be completed to distribute prizes', 400);
  }

  await eventsService.distributePrize(eventId, userId);
  return c.json({ data: { message: 'Prize distributed' } });
});

// POST /admin/events/:id/archive — completed → archived
adminEventsRouter.post('/:id/archive', async (c) => {
  const eventId = c.req.param('id');
  const event = await eventsService.getEventById(eventId);
  if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
  if (event.status !== 'completed') {
    throw new AppError('INVALID_STATE', 'Event must be completed to archive', 400);
  }

  const updated = await eventsService.setStatus(eventId, 'archived');
  if (!updated) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);

  const data = await eventsService.formatEventResponse(updated);
  return c.json({ data });
});

// GET /admin/events/:id/distribution-status — Prize distribution progress
adminEventsRouter.get('/:id/distribution-status', async (c) => {
  const eventId = c.req.param('id');
  const winners = await eventsService.getWinnersForDistribution(eventId);
  const distributed = winners.filter((w) => w.prizeTxHash);

  return c.json({
    data: {
      total: winners.length,
      distributed: distributed.length,
      pending: winners.length - distributed.length,
      winners: winners.map((w) => ({
        userId: w.userId,
        address: w.address,
        amount: w.prizeAmount,
        rank: w.finalRank,
        txHash: w.prizeTxHash,
      })),
    },
  });
});
