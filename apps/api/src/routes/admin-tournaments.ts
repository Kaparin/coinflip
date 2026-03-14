import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { adminMiddleware } from '../middleware/admin.js';
import { tournamentService } from '../services/tournament.service.js';
import { CreateTournamentRequestSchema, UpdateTournamentRequestSchema } from '@coinflip/shared/schemas';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const adminTournamentsRouter = new Hono<AppEnv>();

// All routes require admin
adminTournamentsRouter.use('*', adminMiddleware);

/** List all tournaments (any status) */
adminTournamentsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const data = await tournamentService.getAllTournaments(status);
  const formatted = await Promise.all(data.map((t) => tournamentService.formatTournamentResponse(t)));
  return c.json({ data: formatted });
});

/** Create tournament */
adminTournamentsRouter.post(
  '/',
  zValidator('json', CreateTournamentRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const address = c.get('address') as string;
    const tournament = await tournamentService.createTournament({ ...body, createdBy: address });
    const formatted = await tournamentService.formatTournamentResponse(tournament);
    return c.json({ data: formatted }, 201);
  },
);

/** Create and immediately open registration */
adminTournamentsRouter.post(
  '/create-and-open',
  zValidator('json', CreateTournamentRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const address = c.get('address') as string;
    const tournament = await tournamentService.createTournament({ ...body, createdBy: address });
    await tournamentService.openRegistration(tournament.id);
    const updated = await tournamentService.getTournamentById(tournament.id);
    if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found after creation', 500);
    const formatted = await tournamentService.formatTournamentResponse(updated);
    return c.json({ data: formatted }, 201);
  },
);

/** Update tournament */
adminTournamentsRouter.put(
  '/:id',
  zValidator('json', UpdateTournamentRequestSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    // Convert nullable maxParticipants to undefined for the service
    const params = {
      ...body,
      maxParticipants: body.maxParticipants === null ? undefined : body.maxParticipants,
    };
    const updated = await tournamentService.updateTournament(id, params);
    if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    const formatted = await tournamentService.formatTournamentResponse(updated);
    return c.json({ data: formatted });
  },
);

/** Delete draft tournament */
adminTournamentsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await tournamentService.deleteTournament(id);
  return c.json({ data: { deleted: true } });
});

/** Open registration (draft → registration) */
adminTournamentsRouter.post('/:id/open-registration', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.openRegistration(id);
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** Start tournament (registration → active) */
adminTournamentsRouter.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.startTournament(id);
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** End tournament (active → calculating) */
adminTournamentsRouter.post('/:id/end', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.endTournament(id);
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** Cancel tournament (any pre-completed → canceled, refunds all) */
adminTournamentsRouter.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.cancelTournament(id);
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** Calculate results */
adminTournamentsRouter.post('/:id/calculate', async (c) => {
  const id = c.req.param('id');
  const results = await tournamentService.calculateResults(id);
  return c.json({ data: results });
});

/** Approve results (calculating → completed) */
adminTournamentsRouter.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.approveResults(id);
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** Distribute prizes to team captains */
adminTournamentsRouter.post('/:id/distribute', async (c) => {
  const id = c.req.param('id');
  const result = await tournamentService.distributePrizes(id);
  return c.json({ data: result });
});

/** Archive (completed → archived) */
adminTournamentsRouter.post('/:id/archive', async (c) => {
  const id = c.req.param('id');
  const updated = await tournamentService.setStatus(id, 'archived');
  if (!updated) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
  return c.json({ data: { status: updated.status } });
});

/** Add notification manually */
adminTournamentsRouter.post(
  '/:id/notify',
  zValidator(
    'json',
    z.object({
      type: z.string(),
      titleRu: z.string(),
      titleEn: z.string(),
      messageRu: z.string().optional(),
      messageEn: z.string().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    await tournamentService.createNotification(id, body.type, body.titleRu, body.titleEn, body.messageRu, body.messageEn);
    return c.json({ data: { created: true } });
  },
);

export { adminTournamentsRouter };
