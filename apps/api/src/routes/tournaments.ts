import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { tournamentService } from '../services/tournament.service.js';
import { z } from 'zod';
import {
  CreateTeamRequestSchema,
  UpdateTeamRequestSchema,
} from '@coinflip/shared/schemas';
import type { AppEnv } from '../types.js';

const tournamentsRouter = new Hono<AppEnv>();

function getUserId(c: { get: (key: string) => unknown }): string {
  const user = c.get('user') as { id: string } | undefined;
  if (!user) throw new Error('User not found in context');
  return user.id;
}

function tryGetUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as { id: string } | undefined;
  return user?.id;
}

// ==================== STATIC routes FIRST (before /:id) ====================

/** User search for invites — MUST be before /:id to avoid route conflict */
tournamentsRouter.get(
  '/search/users',
  authMiddleware,
  zValidator('query', z.object({ q: z.string().min(2) })),
  async (c) => {
    const { q } = c.req.valid('query');
    const data = await tournamentService.searchUsers(q);
    return c.json({ data });
  },
);

/** List active & registration tournaments */
tournamentsRouter.get('/active', optionalAuthMiddleware, async (c) => {
  const userId = tryGetUserId(c);
  const list = await tournamentService.getActiveTournaments();
  const data = await Promise.all(list.map((t) => tournamentService.formatTournamentResponse(t, userId)));
  return c.json({ data });
});

/** List completed tournaments */
tournamentsRouter.get(
  '/completed',
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })),
  async (c) => {
    const { limit, offset } = c.req.valid('query');
    const list = await tournamentService.getCompletedTournaments(limit, offset);
    const data = await Promise.all(list.map((t) => tournamentService.formatTournamentResponse(t)));
    return c.json({ data });
  },
);

// ==================== DYNAMIC /:id routes ====================

/** Get tournament details */
tournamentsRouter.get('/:id', optionalAuthMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = tryGetUserId(c);
  const tournament = await tournamentService.getTournamentById(id);
  if (!tournament) return c.json({ error: { code: 'NOT_FOUND', message: 'Tournament not found' } }, 404);
  const data = await tournamentService.formatTournamentResponse(tournament, userId);
  return c.json({ data });
});

/** Pay entry fee */
tournamentsRouter.post('/:id/pay', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  const result = await tournamentService.payEntryFee(tournamentId, userId);
  return c.json({ data: result });
});

// ---- Teams ----

tournamentsRouter.get('/:id/teams', optionalAuthMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const teams = await tournamentService.getTeamsForTournament(tournamentId);
  return c.json({ data: teams });
});

tournamentsRouter.get('/:id/teams/:teamId', optionalAuthMiddleware, async (c) => {
  const teamId = c.req.param('teamId');
  const team = await tournamentService.getTeamWithMembers(teamId);
  if (!team) return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
  // Strip invite code for non-captains
  const userId = tryGetUserId(c);
  const sanitized = { ...team, inviteCode: team.captainUserId === userId ? team.inviteCode : null };
  return c.json({ data: sanitized });
});

tournamentsRouter.post(
  '/:id/teams',
  authMiddleware,
  zValidator('json', CreateTeamRequestSchema),
  async (c) => {
    const tournamentId = c.req.param('id');
    const userId = getUserId(c);
    const body = c.req.valid('json');
    const team = await tournamentService.createTeam(tournamentId, userId, body);
    return c.json({ data: team }, 201);
  },
);

tournamentsRouter.put(
  '/:id/teams/my',
  authMiddleware,
  zValidator('json', UpdateTeamRequestSchema),
  async (c) => {
    const tournamentId = c.req.param('id');
    const userId = getUserId(c);
    const body = c.req.valid('json');
    const updated = await tournamentService.updateTeam(tournamentId, userId, body);
    return c.json({ data: updated });
  },
);

tournamentsRouter.delete('/:id/teams/my', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  await tournamentService.deleteTeam(tournamentId, userId);
  return c.json({ data: { deleted: true } });
});

tournamentsRouter.post('/:id/teams/:teamId/join', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const userId = getUserId(c);
  await tournamentService.joinTeam(tournamentId, teamId, userId);
  return c.json({ data: { joined: true } });
});

tournamentsRouter.post(
  '/:id/join-by-code',
  authMiddleware,
  zValidator('json', z.object({ inviteCode: z.string().min(1) })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const userId = getUserId(c);
    const { inviteCode } = c.req.valid('json');
    const team = await tournamentService.joinTeamByInviteCode(tournamentId, inviteCode, userId);
    return c.json({ data: { joined: true, teamId: team.id, teamName: team.name } });
  },
);

tournamentsRouter.post('/:id/leave', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  await tournamentService.leaveTeam(tournamentId, userId);
  return c.json({ data: { left: true } });
});

tournamentsRouter.post(
  '/:id/kick',
  authMiddleware,
  zValidator('json', z.object({ userId: z.string().uuid() })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const captainUserId = getUserId(c);
    const { userId: targetUserId } = c.req.valid('json');
    await tournamentService.kickMember(tournamentId, captainUserId, targetUserId);
    return c.json({ data: { kicked: true } });
  },
);

// ---- Join requests ----

tournamentsRouter.post('/:id/teams/:teamId/request', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const userId = getUserId(c);
  const request = await tournamentService.createJoinRequest(tournamentId, teamId, userId);
  return c.json({ data: request }, 201);
});

tournamentsRouter.get('/:id/my-requests', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  const participant = await tournamentService.getParticipant(tournamentId, userId);
  if (!participant || !participant.teamId) return c.json({ data: [] });
  const requests = await tournamentService.getPendingRequests(participant.teamId);
  return c.json({ data: requests });
});

tournamentsRouter.post(
  '/:id/requests/:requestId',
  authMiddleware,
  zValidator('json', z.object({ approve: z.boolean() })),
  async (c) => {
    const requestId = c.req.param('requestId');
    const userId = getUserId(c);
    const { approve } = c.req.valid('json');
    const result = await tournamentService.resolveJoinRequest(requestId, userId, approve);
    return c.json({ data: result });
  },
);

// ---- Invite system ----

tournamentsRouter.post(
  '/:id/invite',
  authMiddleware,
  zValidator('json', z.object({ targetUserId: z.string().uuid() })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const captainUserId = getUserId(c);
    const { targetUserId } = c.req.valid('json');
    const result = await tournamentService.invitePlayer(tournamentId, captainUserId, targetUserId);
    return c.json({ data: result });
  },
);

tournamentsRouter.get('/:id/my-invites', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  const data = await tournamentService.getPendingInvites(tournamentId, userId);
  return c.json({ data });
});

tournamentsRouter.post(
  '/:id/invites/:inviteId',
  authMiddleware,
  zValidator('json', z.object({ accept: z.boolean() })),
  async (c) => {
    const inviteId = c.req.param('inviteId');
    const userId = getUserId(c);
    const { accept } = c.req.valid('json');
    const result = await tournamentService.resolveInvite(inviteId, userId, accept);
    return c.json({ data: result });
  },
);

// ---- Leaderboard ----

tournamentsRouter.get(
  '/:id/leaderboard/teams',
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const { limit, offset } = c.req.valid('query');
    const data = await tournamentService.getTeamLeaderboard(tournamentId, limit, offset);
    return c.json({ data });
  },
);

tournamentsRouter.get(
  '/:id/leaderboard/individual',
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const { limit, offset } = c.req.valid('query');
    const data = await tournamentService.getIndividualLeaderboard(tournamentId, limit, offset);
    return c.json({ data });
  },
);

// ---- Notifications, results, points, captain transfer ----

tournamentsRouter.get('/:id/notifications', async (c) => {
  const tournamentId = c.req.param('id');
  const data = await tournamentService.getNotifications(tournamentId);
  return c.json({ data });
});

tournamentsRouter.get('/:id/results', async (c) => {
  const tournamentId = c.req.param('id');
  const tournament = await tournamentService.getTournamentById(tournamentId);
  if (!tournament) return c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  return c.json({ data: tournament.results ?? null });
});

tournamentsRouter.get('/:id/my-points', authMiddleware, async (c) => {
  const tournamentId = c.req.param('id');
  const userId = getUserId(c);
  const data = await tournamentService.getPointHistory(tournamentId, userId);
  return c.json({ data });
});

tournamentsRouter.post(
  '/:id/transfer-captain',
  authMiddleware,
  zValidator('json', z.object({ newCaptainUserId: z.string().uuid() })),
  async (c) => {
    const tournamentId = c.req.param('id');
    const userId = getUserId(c);
    const { newCaptainUserId } = c.req.valid('json');
    await tournamentService.transferCaptain(tournamentId, userId, newCaptainUserId);
    return c.json({ data: { transferred: true } });
  },
);

export { tournamentsRouter };
