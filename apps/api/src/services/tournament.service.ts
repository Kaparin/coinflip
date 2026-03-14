import { getDb } from '../lib/db.js';
import {
  tournaments,
  tournamentTeams,
  tournamentParticipants,
  tournamentJoinRequests,
  tournamentPointLogs,
  tournamentNotifications,
  bets,
  users,
} from '@coinflip/db/schema';
import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { vaultService } from './vault.service.js';
import { wsService } from './ws.service.js';
import { translationService } from './translation.service.js';
import { TOURNAMENT_LEADERBOARD_CACHE_TTL_MS } from '@coinflip/shared/constants';
import crypto from 'node:crypto';

// ---- Types ----

type ScoringTier = {
  minAmount: string;
  maxAmount: string;
  winPoints: number;
  lossPoints: number;
};

type ScoringConfig = { tiers: ScoringTier[] };
type TeamConfig = { minSize: number; maxSize: number };
type PrizeDistEntry = { place: number; percent: number };

type CreateTournamentParams = {
  title: string;
  description?: string;
  entryFee: string;
  commissionBps?: number;
  bonusPool?: string;
  prizeDistribution: PrizeDistEntry[];
  scoringConfig: ScoringConfig;
  teamConfig?: TeamConfig;
  maxParticipants?: number;
  registrationStartsAt: string;
  registrationEndsAt: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
};

// ---- Leaderboard cache ----
const leaderboardCache = new Map<string, { data: unknown; ts: number }>();

function getCached<T>(key: string): T | null {
  const entry = leaderboardCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TOURNAMENT_LEADERBOARD_CACHE_TTL_MS) {
    leaderboardCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown) {
  leaderboardCache.set(key, { data, ts: Date.now() });
}

// ---- Service ----

class TournamentService {
  private get db() {
    return getDb();
  }

  // ==================== CRUD ====================

  async createTournament(params: CreateTournamentParams) {
    const {
      title,
      description,
      entryFee,
      commissionBps = 0,
      bonusPool = '0',
      prizeDistribution,
      scoringConfig,
      teamConfig = { minSize: 1, maxSize: 10 },
      maxParticipants,
      registrationStartsAt,
      registrationEndsAt,
      startsAt,
      endsAt,
      createdBy,
    } = params;

    // Validate dates
    const regStart = new Date(registrationStartsAt);
    const regEnd = new Date(registrationEndsAt);
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    if (regEnd > start) throw new AppError('INVALID_DATES', 'Registration must end before tournament starts', 400);
    if (start >= end) throw new AppError('INVALID_DATES', 'Start must be before end', 400);
    if (regStart >= regEnd) throw new AppError('INVALID_DATES', 'Registration start must be before registration end', 400);

    // Validate prize distribution totals 100%
    const totalPercent = prizeDistribution.reduce((s, p) => s + p.percent, 0);
    if (totalPercent !== 100) throw new AppError('INVALID_PRIZES', `Prize distribution must total 100%, got ${totalPercent}%`, 400);

    // Auto-translate
    let titleEn: string | null = null;
    let titleRu: string | null = null;
    let descriptionEn: string | null = null;
    let descriptionRu: string | null = null;
    try {
      const translated = await translationService.translateEvent(title, description ?? null);
      titleEn = translated.titleEn;
      titleRu = translated.titleRu;
      descriptionEn = translated.descriptionEn;
      descriptionRu = translated.descriptionRu;
    } catch (err) {
      logger.warn({ err }, 'Translation failed for tournament, using original text');
    }

    const [tournament] = await this.db
      .insert(tournaments)
      .values({
        title,
        description: description ?? null,
        titleEn,
        titleRu,
        descriptionEn,
        descriptionRu,
        status: 'draft',
        entryFee,
        bonusPool,
        commissionBps,
        prizeDistribution: JSON.stringify(prizeDistribution),
        scoringConfig: JSON.stringify(scoringConfig),
        teamConfig: JSON.stringify(teamConfig),
        maxParticipants: maxParticipants ?? null,
        registrationStartsAt: regStart,
        registrationEndsAt: regEnd,
        startsAt: start,
        endsAt: end,
        createdBy,
      })
      .returning();

    logger.info({ tournamentId: tournament!.id, title }, 'Tournament created');
    return tournament!;
  }

  async updateTournament(tournamentId: string, params: Partial<CreateTournamentParams>) {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (!['draft', 'registration'].includes(tournament.status)) {
      throw new AppError('INVALID_STATE', 'Can only update draft or registration tournaments', 400);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.entryFee !== undefined) updates.entryFee = params.entryFee;
    if (params.commissionBps !== undefined) updates.commissionBps = params.commissionBps;
    if (params.bonusPool !== undefined) updates.bonusPool = params.bonusPool;
    if (params.maxParticipants !== undefined) updates.maxParticipants = params.maxParticipants;

    if (params.prizeDistribution !== undefined) {
      const totalPercent = params.prizeDistribution.reduce((s, p) => s + p.percent, 0);
      if (totalPercent !== 100) throw new AppError('INVALID_PRIZES', `Prize distribution must total 100%, got ${totalPercent}%`, 400);
      updates.prizeDistribution = JSON.stringify(params.prizeDistribution);
    }
    if (params.scoringConfig !== undefined) updates.scoringConfig = JSON.stringify(params.scoringConfig);
    if (params.teamConfig !== undefined) updates.teamConfig = JSON.stringify(params.teamConfig);
    if (params.registrationStartsAt !== undefined) updates.registrationStartsAt = new Date(params.registrationStartsAt);
    if (params.registrationEndsAt !== undefined) updates.registrationEndsAt = new Date(params.registrationEndsAt);
    if (params.startsAt !== undefined) updates.startsAt = new Date(params.startsAt);
    if (params.endsAt !== undefined) updates.endsAt = new Date(params.endsAt);

    // Re-translate if title/description changed
    if (params.title !== undefined || params.description !== undefined) {
      try {
        const t = params.title ?? tournament.title;
        const d = params.description ?? tournament.description;
        const translated = await translationService.translateEvent(t, d ?? null);
        updates.titleEn = translated.titleEn;
        updates.titleRu = translated.titleRu;
        updates.descriptionEn = translated.descriptionEn;
        updates.descriptionRu = translated.descriptionRu;
      } catch {
        // Keep existing translations
      }
    }

    const [updated] = await this.db
      .update(tournaments)
      .set(updates)
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return updated;
  }

  async deleteTournament(tournamentId: string) {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (tournament.status !== 'draft') {
      throw new AppError('INVALID_STATE', 'Can only delete draft tournaments', 400);
    }
    await this.db.delete(tournaments).where(eq(tournaments.id, tournamentId));
  }

  // ==================== Queries ====================

  async getTournamentById(id: string) {
    const rows = await this.db.select().from(tournaments).where(eq(tournaments.id, id));
    return rows[0] ?? null;
  }

  async getAllTournaments(statusFilter?: string) {
    const conditions = statusFilter ? [eq(tournaments.status, statusFilter)] : [];
    return this.db
      .select()
      .from(tournaments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(tournaments.createdAt));
  }

  async getActiveTournaments() {
    return this.db
      .select()
      .from(tournaments)
      .where(
        inArray(tournaments.status, ['registration', 'active']),
      )
      .orderBy(asc(tournaments.startsAt));
  }

  async getCompletedTournaments(limit = 20, offset = 0) {
    return this.db
      .select()
      .from(tournaments)
      .where(inArray(tournaments.status, ['completed', 'calculating']))
      .orderBy(desc(tournaments.endsAt))
      .limit(limit)
      .offset(offset);
  }

  // ==================== Status transitions ====================

  async setStatus(tournamentId: string, status: string) {
    const [updated] = await this.db
      .update(tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId))
      .returning();
    return updated;
  }

  async openRegistration(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'draft') throw new AppError('INVALID_STATE', 'Tournament must be in draft status', 400);

    const updated = await this.setStatus(tournamentId, 'registration');

    await this.createNotification(tournamentId, 'registration_open', 'Регистрация открыта!', 'Registration is open!');

    wsService.broadcast({
      type: 'tournament_notification',
      data: { tournamentId, notificationType: 'registration_open', title: t.title },
    });

    return updated;
  }

  async startTournament(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Tournament must be in registration status', 400);

    const updated = await this.setStatus(tournamentId, 'active');

    await this.createNotification(tournamentId, 'started', 'Турнир начался!', 'Tournament has started!');

    wsService.broadcast({
      type: 'tournament_started',
      data: { tournamentId, title: t.title },
    });

    return updated;
  }

  async endTournament(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'active') throw new AppError('INVALID_STATE', 'Tournament must be active', 400);

    const updated = await this.setStatus(tournamentId, 'calculating');

    await this.createNotification(tournamentId, 'ended', 'Турнир завершён! Идёт подсчёт...', 'Tournament ended! Calculating results...');

    wsService.broadcast({
      type: 'tournament_ended',
      data: { tournamentId, title: t.title },
    });

    return updated;
  }

  async cancelTournament(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (['completed', 'archived', 'canceled'].includes(t.status)) {
      throw new AppError('INVALID_STATE', 'Cannot cancel a completed/archived/canceled tournament', 400);
    }

    // Refund all participants
    const participants = await this.db
      .select()
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, tournamentId));

    const entryFee = t.entryFee;
    if (BigInt(entryFee) > 0n) {
      for (const p of participants) {
        try {
          await vaultService.creditWinnings(p.userId, entryFee);
          logger.info({ userId: p.userId, amount: entryFee }, 'Tournament entry fee refunded');
        } catch (err) {
          logger.error({ userId: p.userId, err }, 'Failed to refund tournament entry fee');
        }
      }
    }

    const updated = await this.setStatus(tournamentId, 'canceled');

    await this.createNotification(tournamentId, 'ended', 'Турнир отменён. Взносы возвращены.', 'Tournament canceled. Entry fees refunded.');

    wsService.broadcast({
      type: 'tournament_canceled',
      data: { tournamentId, title: t.title, refundedCount: participants.length },
    });

    return updated;
  }

  // ==================== Entry fee & participation ====================

  async payEntryFee(tournamentId: string, userId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Registration is not open', 400);

    const now = new Date();
    if (now > t.registrationEndsAt) throw new AppError('REGISTRATION_CLOSED', 'Registration period has ended', 400);

    // Check if already paid (has any participant record)
    const existing = await this.db
      .select()
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    if (existing.length > 0) throw new AppError('ALREADY_PAID', 'You have already paid for this tournament', 400);

    // Check max participants
    if (t.maxParticipants) {
      const countResult = await this.db.execute(
        sql`SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ${tournamentId}`,
      );
      const cnt = Number((countResult as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
      if (cnt >= t.maxParticipants) throw new AppError('TOURNAMENT_FULL', 'Tournament is full', 400);
    }

    // Deduct entry fee
    const fee = t.entryFee;
    if (BigInt(fee) > 0n) {
      const deducted = await vaultService.deductBalance(userId, fee);
      if (!deducted) throw new AppError('INSUFFICIENT_BALANCE', 'Not enough AXM to pay entry fee', 400);
    }

    // Add to prize pool (after commission)
    const commission = (BigInt(fee) * BigInt(t.commissionBps)) / 10000n;
    const netContribution = BigInt(fee) - commission;

    await this.db
      .update(tournaments)
      .set({
        prizePool: sql`${tournaments.prizePool}::numeric + ${netContribution.toString()}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId));

    logger.info({ tournamentId, userId, fee, commission: commission.toString() }, 'Tournament entry fee paid');

    return { paid: true, fee, commission: commission.toString() };
  }

  /** Check if user has paid for this tournament */
  async hasPaid(tournamentId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: tournamentParticipants.id })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  // ==================== Teams ====================

  async createTeam(
    tournamentId: string,
    userId: string,
    params: { name: string; description?: string; avatarUrl?: string; isOpen?: boolean },
  ) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Can only create teams during registration', 400);

    const now = new Date();
    if (now > t.registrationEndsAt) throw new AppError('REGISTRATION_CLOSED', 'Registration period has ended', 400);

    // Must have paid first
    const paid = await this.hasPaid(tournamentId, userId);
    if (paid) throw new AppError('ALREADY_IN_TEAM', 'You are already in a team for this tournament', 400);

    // Pay entry fee first (inline)
    await this.payEntryFee(tournamentId, userId);

    // Generate invite code for the team
    const inviteCode = crypto.randomBytes(6).toString('hex');

    const [team] = await this.db
      .insert(tournamentTeams)
      .values({
        tournamentId,
        name: params.name,
        description: params.description ?? null,
        avatarUrl: params.avatarUrl ?? null,
        captainUserId: userId,
        inviteCode,
        isOpen: params.isOpen ?? true,
      })
      .returning();

    // Add captain as first participant
    await this.db.insert(tournamentParticipants).values({
      tournamentId,
      teamId: team!.id,
      userId,
    });

    logger.info({ tournamentId, teamId: team!.id, userId }, 'Team created');

    wsService.broadcast({
      type: 'tournament_team_update',
      data: { tournamentId, teamId: team!.id, action: 'created', teamName: team!.name },
    });

    return team!;
  }

  async joinTeam(tournamentId: string, teamId: string, userId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Can only join teams during registration', 400);

    const now = new Date();
    if (now > t.registrationEndsAt) throw new AppError('REGISTRATION_CLOSED', 'Registration period has ended', 400);

    // Check not already in a team
    const alreadyIn = await this.hasPaid(tournamentId, userId);
    if (alreadyIn) throw new AppError('ALREADY_IN_TEAM', 'You are already in a team for this tournament', 400);

    const team = await this.getTeamById(teamId);
    if (!team) throw new AppError('NOT_FOUND', 'Team not found', 404);
    if (team.tournamentId !== tournamentId) throw new AppError('INVALID_STATE', 'Team does not belong to this tournament', 400);

    // Check team size
    const teamConfig = t.teamConfig as TeamConfig;
    const memberCount = await this.getTeamMemberCount(teamId);
    if (memberCount >= teamConfig.maxSize) throw new AppError('TEAM_FULL', 'Team is full', 400);

    // If closed team, must have approved join request or invite code
    if (!team.isOpen) {
      throw new AppError('TEAM_CLOSED', 'This team is closed. Use invite code or send a join request.', 400);
    }

    // Pay entry fee
    await this.payEntryFee(tournamentId, userId);

    // Add participant
    await this.db.insert(tournamentParticipants).values({
      tournamentId,
      teamId,
      userId,
    });

    // Update team points cache
    logger.info({ tournamentId, teamId, userId }, 'Player joined team');

    wsService.broadcast({
      type: 'tournament_team_update',
      data: { tournamentId, teamId, action: 'member_joined' },
    });
  }

  async joinTeamByInviteCode(tournamentId: string, inviteCode: string, userId: string) {
    const teams = await this.db
      .select()
      .from(tournamentTeams)
      .where(
        and(
          eq(tournamentTeams.tournamentId, tournamentId),
          eq(tournamentTeams.inviteCode, inviteCode),
        ),
      );
    const team = teams[0];
    if (!team) throw new AppError('NOT_FOUND', 'Invalid invite code', 404);

    // Temporarily treat as open for invite-code join
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Can only join during registration', 400);

    const now = new Date();
    if (now > t.registrationEndsAt) throw new AppError('REGISTRATION_CLOSED', 'Registration has ended', 400);

    const alreadyIn = await this.hasPaid(tournamentId, userId);
    if (alreadyIn) throw new AppError('ALREADY_IN_TEAM', 'You are already in a team', 400);

    const teamConfig = t.teamConfig as TeamConfig;
    const memberCount = await this.getTeamMemberCount(team.id);
    if (memberCount >= teamConfig.maxSize) throw new AppError('TEAM_FULL', 'Team is full', 400);

    await this.payEntryFee(tournamentId, userId);

    await this.db.insert(tournamentParticipants).values({
      tournamentId,
      teamId: team.id,
      userId,
    });

    logger.info({ tournamentId, teamId: team.id, userId, inviteCode }, 'Player joined team via invite code');

    wsService.broadcast({
      type: 'tournament_team_update',
      data: { tournamentId, teamId: team.id, action: 'member_joined' },
    });

    return team;
  }

  async leaveTeam(tournamentId: string, userId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Cannot leave team after tournament starts', 400);

    const participant = await this.getParticipant(tournamentId, userId);
    if (!participant) throw new AppError('NOT_FOUND', 'You are not in this tournament', 404);

    const team = await this.getTeamById(participant.teamId);

    // If captain, cannot leave — must delete team
    if (team && team.captainUserId === userId) {
      throw new AppError('CAPTAIN_CANNOT_LEAVE', 'Captains must delete the team to leave', 400);
    }

    // Remove participant
    await this.db
      .delete(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );

    // Refund entry fee
    const fee = t.entryFee;
    if (BigInt(fee) > 0n) {
      await vaultService.creditWinnings(userId, fee);
      // Deduct from prize pool
      const commission = (BigInt(fee) * BigInt(t.commissionBps)) / 10000n;
      const netContribution = BigInt(fee) - commission;
      await this.db
        .update(tournaments)
        .set({
          prizePool: sql`GREATEST(0, ${tournaments.prizePool}::numeric - ${netContribution.toString()}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournamentId));
    }

    logger.info({ tournamentId, userId }, 'Player left team, entry fee refunded');
  }

  async kickMember(tournamentId: string, captainUserId: string, targetUserId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Cannot kick after tournament starts', 400);

    const captainParticipant = await this.getParticipant(tournamentId, captainUserId);
    if (!captainParticipant) throw new AppError('NOT_FOUND', 'You are not in this tournament', 404);

    const team = await this.getTeamById(captainParticipant.teamId);
    if (!team || team.captainUserId !== captainUserId) {
      throw new AppError('FORBIDDEN', 'Only the captain can kick members', 403);
    }

    const targetParticipant = await this.getParticipant(tournamentId, targetUserId);
    if (!targetParticipant || targetParticipant.teamId !== team.id) {
      throw new AppError('NOT_FOUND', 'Player not in your team', 404);
    }

    if (targetUserId === captainUserId) {
      throw new AppError('CANNOT_KICK_SELF', 'Cannot kick yourself', 400);
    }

    // Remove participant
    await this.db
      .delete(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, targetUserId),
        ),
      );

    // Refund entry fee
    const fee = t.entryFee;
    if (BigInt(fee) > 0n) {
      await vaultService.creditWinnings(targetUserId, fee);
      const commission = (BigInt(fee) * BigInt(t.commissionBps)) / 10000n;
      const net = BigInt(fee) - commission;
      await this.db
        .update(tournaments)
        .set({
          prizePool: sql`GREATEST(0, ${tournaments.prizePool}::numeric - ${net.toString()}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournamentId));
    }

    logger.info({ tournamentId, captainUserId, targetUserId }, 'Player kicked from team');
  }

  async deleteTeam(tournamentId: string, captainUserId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Cannot delete team after tournament starts', 400);

    const participant = await this.getParticipant(tournamentId, captainUserId);
    if (!participant) throw new AppError('NOT_FOUND', 'Not in tournament', 404);

    const team = await this.getTeamById(participant.teamId);
    if (!team || team.captainUserId !== captainUserId) {
      throw new AppError('FORBIDDEN', 'Only captain can delete the team', 403);
    }

    // Get all team members
    const members = await this.db
      .select()
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.teamId, team.id));

    // Refund all members
    const fee = t.entryFee;
    if (BigInt(fee) > 0n) {
      for (const m of members) {
        try {
          await vaultService.creditWinnings(m.userId, fee);
        } catch (err) {
          logger.error({ userId: m.userId, err }, 'Failed to refund during team deletion');
        }
      }
      // Deduct from prize pool
      const commission = (BigInt(fee) * BigInt(t.commissionBps)) / 10000n;
      const netPer = BigInt(fee) - commission;
      const totalNet = netPer * BigInt(members.length);
      await this.db
        .update(tournaments)
        .set({
          prizePool: sql`GREATEST(0, ${tournaments.prizePool}::numeric - ${totalNet.toString()}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournamentId));
    }

    // Delete join requests
    await this.db.delete(tournamentJoinRequests).where(eq(tournamentJoinRequests.teamId, team.id));

    // Delete participants (cascade would handle this, but explicit is clearer)
    await this.db.delete(tournamentParticipants).where(eq(tournamentParticipants.teamId, team.id));

    // Delete team
    await this.db.delete(tournamentTeams).where(eq(tournamentTeams.id, team.id));

    logger.info({ tournamentId, teamId: team.id, captainUserId, refundedCount: members.length }, 'Team deleted');

    wsService.broadcast({
      type: 'tournament_team_update',
      data: { tournamentId, teamId: team.id, action: 'deleted' },
    });
  }

  async updateTeam(
    tournamentId: string,
    captainUserId: string,
    params: { name?: string; description?: string; avatarUrl?: string; isOpen?: boolean },
  ) {
    const participant = await this.getParticipant(tournamentId, captainUserId);
    if (!participant) throw new AppError('NOT_FOUND', 'Not in tournament', 404);

    const team = await this.getTeamById(participant.teamId);
    if (!team || team.captainUserId !== captainUserId) {
      throw new AppError('FORBIDDEN', 'Only captain can update the team', 403);
    }

    const t = await this.getTournamentById(tournamentId);
    if (!t || t.status !== 'registration') throw new AppError('INVALID_STATE', 'Can only update during registration', 400);

    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.avatarUrl !== undefined) updates.avatarUrl = params.avatarUrl;
    if (params.isOpen !== undefined) updates.isOpen = params.isOpen;

    if (Object.keys(updates).length === 0) return team;

    const [updated] = await this.db
      .update(tournamentTeams)
      .set(updates)
      .where(eq(tournamentTeams.id, team.id))
      .returning();

    return updated;
  }

  // ==================== Join Requests ====================

  async createJoinRequest(tournamentId: string, teamId: string, userId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'registration') throw new AppError('INVALID_STATE', 'Cannot request to join after registration', 400);

    const now = new Date();
    if (now > t.registrationEndsAt) throw new AppError('REGISTRATION_CLOSED', 'Registration has ended', 400);

    // Already in tournament
    const alreadyIn = await this.hasPaid(tournamentId, userId);
    if (alreadyIn) throw new AppError('ALREADY_IN_TEAM', 'You are already in a team', 400);

    const team = await this.getTeamById(teamId);
    if (!team || team.tournamentId !== tournamentId) throw new AppError('NOT_FOUND', 'Team not found', 404);
    if (team.isOpen) throw new AppError('TEAM_OPEN', 'Team is open, join directly', 400);

    // Check existing request
    const existing = await this.db
      .select()
      .from(tournamentJoinRequests)
      .where(
        and(
          eq(tournamentJoinRequests.teamId, teamId),
          eq(tournamentJoinRequests.userId, userId),
        ),
      );

    if (existing.length > 0) {
      const ex = existing[0]!;
      if (ex.status === 'pending') throw new AppError('REQUEST_EXISTS', 'You already have a pending request', 400);
      if (ex.status === 'rejected') {
        // Allow re-request after rejection
        await this.db
          .update(tournamentJoinRequests)
          .set({ status: 'pending', resolvedAt: null })
          .where(eq(tournamentJoinRequests.id, ex.id));
        return ex;
      }
    }

    const [request] = await this.db
      .insert(tournamentJoinRequests)
      .values({ teamId, userId })
      .returning();

    // Notify captain via WS
    const captainRows = await this.db.select({ address: users.address }).from(users).where(eq(users.id, team!.captainUserId));
    wsService.sendToAddress(
      captainRows[0]?.address ?? '',
      {
        type: 'tournament_team_update',
        data: { tournamentId, teamId, action: 'join_request', requestId: request!.id },
      },
    );

    return request;
  }

  async resolveJoinRequest(requestId: string, captainUserId: string, approve: boolean) {
    const requests = await this.db
      .select()
      .from(tournamentJoinRequests)
      .where(eq(tournamentJoinRequests.id, requestId));
    const request = requests[0];
    if (!request) throw new AppError('NOT_FOUND', 'Join request not found', 404);
    if (request.status !== 'pending') throw new AppError('ALREADY_RESOLVED', 'Request already resolved', 400);

    const team = await this.getTeamById(request.teamId);
    if (!team || team.captainUserId !== captainUserId) {
      throw new AppError('FORBIDDEN', 'Only captain can resolve requests', 403);
    }

    const t = await this.getTournamentById(team.tournamentId);
    if (!t || t.status !== 'registration') throw new AppError('INVALID_STATE', 'Tournament not in registration', 400);

    if (approve) {
      // Check team size
      const teamConfig = t.teamConfig as TeamConfig;
      const memberCount = await this.getTeamMemberCount(team.id);
      if (memberCount >= teamConfig.maxSize) throw new AppError('TEAM_FULL', 'Team is full', 400);

      // Check user not already in another team
      const alreadyIn = await this.hasPaid(team.tournamentId, request.userId);
      if (alreadyIn) throw new AppError('ALREADY_IN_TEAM', 'Player is already in a team', 400);

      // Pay entry fee and add to team
      await this.payEntryFee(team.tournamentId, request.userId);
      await this.db.insert(tournamentParticipants).values({
        tournamentId: team.tournamentId,
        teamId: team.id,
        userId: request.userId,
      });
    }

    await this.db
      .update(tournamentJoinRequests)
      .set({ status: approve ? 'approved' : 'rejected', resolvedAt: new Date() })
      .where(eq(tournamentJoinRequests.id, requestId));

    return { approved: approve };
  }

  async getPendingRequests(teamId: string) {
    return this.db
      .select({
        id: tournamentJoinRequests.id,
        teamId: tournamentJoinRequests.teamId,
        userId: tournamentJoinRequests.userId,
        status: tournamentJoinRequests.status,
        createdAt: tournamentJoinRequests.createdAt,
        address: users.address,
        nickname: users.profileNickname,
        avatarUrl: users.avatarUrl,
      })
      .from(tournamentJoinRequests)
      .innerJoin(users, eq(users.id, tournamentJoinRequests.userId))
      .where(
        and(
          eq(tournamentJoinRequests.teamId, teamId),
          eq(tournamentJoinRequests.status, 'pending'),
        ),
      )
      .orderBy(asc(tournamentJoinRequests.createdAt));
  }

  // ==================== Invite by search ====================

  async searchUsers(query: string) {
    if (!query || query.length < 2) return [];
    const isAddress = query.startsWith('axm');

    if (isAddress) {
      return this.db
        .select({ id: users.id, address: users.address, nickname: users.profileNickname, avatarUrl: users.avatarUrl })
        .from(users)
        .where(sql`${users.address} ILIKE ${`%${query}%`}`)
        .limit(10);
    }

    return this.db
      .select({ id: users.id, address: users.address, nickname: users.profileNickname, avatarUrl: users.avatarUrl })
      .from(users)
      .where(sql`${users.profileNickname} ILIKE ${`%${query}%`}`)
      .limit(10);
  }

  // ==================== Scoring ====================

  /**
   * Called when a bet is resolved (revealed / timeout_claimed).
   * Checks all active tournaments and awards points to both players if they're participants.
   */
  async onBetResolved(bet: {
    betId: string;
    makerUserId: string;
    acceptorUserId: string | null;
    winnerUserId: string | null;
    amount: string; // bet amount in micro
    resolvedTime: Date;
  }) {
    if (!bet.acceptorUserId || !bet.winnerUserId) return;

    // Find active tournaments that overlap with this bet's resolved time
    const activeTournaments = await this.db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.status, 'active'),
          sql`${tournaments.startsAt} <= ${bet.resolvedTime.toISOString()}::timestamptz`,
          sql`${tournaments.endsAt} >= ${bet.resolvedTime.toISOString()}::timestamptz`,
        ),
      );

    if (activeTournaments.length === 0) return;

    for (const tournament of activeTournaments) {
      const scoringConfig = tournament.scoringConfig as ScoringConfig;

      // Find matching tier for this bet amount
      const tier = scoringConfig.tiers.find((t) => {
        return BigInt(bet.amount) >= BigInt(t.minAmount) && BigInt(bet.amount) <= BigInt(t.maxAmount);
      });

      if (!tier) continue; // Bet amount doesn't match any tier

      // Award points to both players
      const playerIds = [bet.makerUserId, bet.acceptorUserId];
      for (const playerId of playerIds) {
        const participant = await this.getParticipant(tournament.id, playerId);
        if (!participant) continue; // Player not in this tournament

        const isWinner = playerId === bet.winnerUserId;
        const points = isWinner ? tier.winPoints : tier.lossPoints;

        // Update participant stats
        await this.db
          .update(tournamentParticipants)
          .set({
            totalPoints: sql`${tournamentParticipants.totalPoints}::numeric + ${points}`,
            gamesPlayed: sql`${tournamentParticipants.gamesPlayed} + 1`,
            gamesWon: isWinner
              ? sql`${tournamentParticipants.gamesWon} + 1`
              : tournamentParticipants.gamesWon,
            currentStreak: isWinner
              ? sql`${tournamentParticipants.currentStreak} + 1`
              : sql`0`,
            bestStreak: isWinner
              ? sql`GREATEST(${tournamentParticipants.bestStreak}, ${tournamentParticipants.currentStreak} + 1)`
              : tournamentParticipants.bestStreak,
          })
          .where(eq(tournamentParticipants.id, participant.id));

        // Update team total
        await this.db
          .update(tournamentTeams)
          .set({
            totalPoints: sql`${tournamentTeams.totalPoints}::numeric + ${points}`,
          })
          .where(eq(tournamentTeams.id, participant.teamId));

        // Log points
        await this.db.insert(tournamentPointLogs).values({
          tournamentId: tournament.id,
          participantId: participant.id,
          betId: bet.betId,
          pointsEarned: points,
          reason: isWinner ? 'win' : 'loss',
          betAmount: bet.amount,
        });

        // Broadcast score update
        wsService.broadcast({
          type: 'tournament_score_update',
          data: {
            tournamentId: tournament.id,
            teamId: participant.teamId,
            userId: playerId,
            points,
            totalPoints: (BigInt(participant.totalPoints) + BigInt(points)).toString(),
            reason: isWinner ? 'win' : 'loss',
          },
        });
      }

      // Invalidate leaderboard cache
      leaderboardCache.delete(`team_${tournament.id}`);
      leaderboardCache.delete(`individual_${tournament.id}`);
    }
  }

  // ==================== Leaderboard ====================

  async getTeamLeaderboard(tournamentId: string, limit = 50, offset = 0) {
    const cacheKey = `team_${tournamentId}_${limit}_${offset}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.db
      .select({
        teamId: tournamentTeams.id,
        teamName: tournamentTeams.name,
        teamAvatarUrl: tournamentTeams.avatarUrl,
        totalPoints: tournamentTeams.totalPoints,
        finalRank: tournamentTeams.finalRank,
        prizeAmount: tournamentTeams.prizeAmount,
      })
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .orderBy(desc(sql`${tournamentTeams.totalPoints}::numeric`))
      .limit(limit)
      .offset(offset);

    // Add rank, member count
    const result = await Promise.all(
      rows.map(async (row, idx) => {
        const memberCount = await this.getTeamMemberCount(row.teamId);
        return {
          rank: offset + idx + 1,
          teamId: row.teamId,
          teamName: row.teamName,
          teamAvatarUrl: row.teamAvatarUrl,
          totalPoints: row.totalPoints,
          memberCount,
          prizeAmount: row.prizeAmount,
        };
      }),
    );

    setCache(cacheKey, result);
    return result;
  }

  async getIndividualLeaderboard(tournamentId: string, limit = 50, offset = 0) {
    const cacheKey = `individual_${tournamentId}_${limit}_${offset}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.db
      .select({
        participantId: tournamentParticipants.id,
        userId: tournamentParticipants.userId,
        teamId: tournamentParticipants.teamId,
        totalPoints: tournamentParticipants.totalPoints,
        gamesPlayed: tournamentParticipants.gamesPlayed,
        gamesWon: tournamentParticipants.gamesWon,
        bestStreak: tournamentParticipants.bestStreak,
        address: users.address,
        nickname: users.profileNickname,
        avatarUrl: users.avatarUrl,
        teamName: tournamentTeams.name,
      })
      .from(tournamentParticipants)
      .innerJoin(users, eq(users.id, tournamentParticipants.userId))
      .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentParticipants.teamId))
      .where(eq(tournamentParticipants.tournamentId, tournamentId))
      .orderBy(desc(sql`${tournamentParticipants.totalPoints}::numeric`))
      .limit(limit)
      .offset(offset);

    const result = rows.map((row, idx) => ({
      rank: offset + idx + 1,
      userId: row.userId,
      address: row.address,
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      teamId: row.teamId,
      teamName: row.teamName,
      totalPoints: row.totalPoints,
      gamesPlayed: row.gamesPlayed,
      gamesWon: row.gamesWon,
      bestStreak: row.bestStreak,
    }));

    setCache(cacheKey, result);
    return result;
  }

  // ==================== Team details ====================

  async getTeamById(teamId: string) {
    const rows = await this.db.select().from(tournamentTeams).where(eq(tournamentTeams.id, teamId));
    return rows[0] ?? null;
  }

  async getTeamMemberCount(teamId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*) as cnt FROM tournament_participants WHERE team_id = ${teamId}`,
    );
    return Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
  }

  async getTeamWithMembers(teamId: string) {
    const team = await this.getTeamById(teamId);
    if (!team) return null;

    const members = await this.db
      .select({
        userId: tournamentParticipants.userId,
        totalPoints: tournamentParticipants.totalPoints,
        gamesPlayed: tournamentParticipants.gamesPlayed,
        gamesWon: tournamentParticipants.gamesWon,
        bestStreak: tournamentParticipants.bestStreak,
        address: users.address,
        nickname: users.profileNickname,
        avatarUrl: users.avatarUrl,
      })
      .from(tournamentParticipants)
      .innerJoin(users, eq(users.id, tournamentParticipants.userId))
      .where(eq(tournamentParticipants.teamId, teamId))
      .orderBy(desc(sql`${tournamentParticipants.totalPoints}::numeric`));

    const captain = await this.db
      .select({ address: users.address, nickname: users.profileNickname })
      .from(users)
      .where(eq(users.id, team.captainUserId));

    return {
      ...team,
      captainAddress: captain[0]?.address ?? '',
      captainNickname: captain[0]?.nickname ?? null,
      memberCount: members.length,
      members: members.map((m) => ({
        ...m,
        isCaptain: m.userId === team.captainUserId,
      })),
    };
  }

  async getTeamsForTournament(tournamentId: string) {
    const teams = await this.db
      .select()
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .orderBy(desc(sql`${tournamentTeams.totalPoints}::numeric`));

    return Promise.all(teams.map((team) => this.getTeamWithMembers(team.id)));
  }

  async getParticipant(tournamentId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    return rows[0] ?? null;
  }

  async getParticipantCount(tournamentId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ${tournamentId}`,
    );
    return Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
  }

  async getTeamCount(tournamentId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*) as cnt FROM tournament_teams WHERE tournament_id = ${tournamentId}`,
    );
    return Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
  }

  // ==================== Results ====================

  async calculateResults(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (!['calculating', 'active'].includes(t.status)) {
      throw new AppError('INVALID_STATE', 'Tournament must be active or calculating', 400);
    }

    // Transition to calculating if active
    if (t.status === 'active') {
      await this.setStatus(tournamentId, 'calculating');
    }

    const prizeDistribution = t.prizeDistribution as PrizeDistEntry[];
    const totalPool = BigInt(t.prizePool) + BigInt(t.bonusPool);

    // Get team rankings
    const teams = await this.db
      .select()
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId))
      .orderBy(desc(sql`${tournamentTeams.totalPoints}::numeric`));

    const teamRankings = [];

    for (let i = 0; i < teams.length; i++) {
      const team = teams[i]!;
      const place = i + 1;
      const distEntry = prizeDistribution.find((d) => d.place === place);
      const prizeAmount = distEntry ? ((totalPool * BigInt(Math.round(distEntry.percent * 100))) / 10000n).toString() : '0';

      // Update team rank & prize
      await this.db
        .update(tournamentTeams)
        .set({ finalRank: place, prizeAmount })
        .where(eq(tournamentTeams.id, team.id));

      // Get members with recommended share
      const members = await this.db
        .select({
          userId: tournamentParticipants.userId,
          totalPoints: tournamentParticipants.totalPoints,
          gamesPlayed: tournamentParticipants.gamesPlayed,
          gamesWon: tournamentParticipants.gamesWon,
          address: users.address,
          nickname: users.profileNickname,
        })
        .from(tournamentParticipants)
        .innerJoin(users, eq(users.id, tournamentParticipants.userId))
        .where(eq(tournamentParticipants.teamId, team.id))
        .orderBy(desc(sql`${tournamentParticipants.totalPoints}::numeric`));

      // Calculate recommended shares
      const teamTotalPoints = members.reduce((s, m) => s + BigInt(m.totalPoints), 0n);
      const membersWithShares = members.map((m, idx) => {
        let recommendedShare = '0';
        if (teamTotalPoints > 0n && BigInt(prizeAmount) > 0n) {
          recommendedShare = ((BigInt(prizeAmount) * BigInt(m.totalPoints)) / teamTotalPoints).toString();
        }
        // Update individual rank
        this.db
          .update(tournamentParticipants)
          .set({ finalRank: idx + 1 })
          .where(
            and(
              eq(tournamentParticipants.tournamentId, tournamentId),
              eq(tournamentParticipants.userId, m.userId),
            ),
          )
          .execute();

        return {
          userId: m.userId,
          address: m.address,
          nickname: m.nickname,
          totalPoints: m.totalPoints,
          gamesPlayed: m.gamesPlayed,
          gamesWon: m.gamesWon,
          recommendedShare,
        };
      });

      teamRankings.push({
        rank: place,
        teamId: team.id,
        teamName: team.name,
        totalPoints: team.totalPoints,
        prizeAmount,
        members: membersWithShares,
      });
    }

    const results = { teamRankings };

    await this.db
      .update(tournaments)
      .set({ results: JSON.stringify(results), updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    logger.info({ tournamentId, teamsRanked: teams.length }, 'Tournament results calculated');

    return results;
  }

  async approveResults(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'calculating') throw new AppError('INVALID_STATE', 'Must be in calculating status', 400);

    const updated = await this.setStatus(tournamentId, 'completed');

    await this.createNotification(
      tournamentId,
      'results',
      'Результаты турнира опубликованы!',
      'Tournament results are published!',
    );

    wsService.broadcast({
      type: 'tournament_results',
      data: { tournamentId, title: t.title, results: t.results },
    });

    return updated;
  }

  async distributePrizes(tournamentId: string) {
    const t = await this.getTournamentById(tournamentId);
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.status !== 'completed') throw new AppError('INVALID_STATE', 'Must be completed', 400);

    const results = t.results as { teamRankings: Array<{ teamId: string; prizeAmount: string; members: Array<{ userId: string }> }> } | null;
    if (!results) throw new AppError('NO_RESULTS', 'No results to distribute', 400);

    let distributed = 0;

    for (const teamRanking of results.teamRankings) {
      if (BigInt(teamRanking.prizeAmount) <= 0n) continue;

      // Find captain
      const team = await this.getTeamById(teamRanking.teamId);
      if (!team) continue;

      // Credit prize to captain's vault
      await vaultService.creditWinnings(team.captainUserId, teamRanking.prizeAmount);
      distributed++;

      logger.info(
        { tournamentId, teamId: team.id, captainUserId: team.captainUserId, amount: teamRanking.prizeAmount },
        'Tournament prize distributed to captain',
      );
    }

    return { distributed };
  }

  // ==================== Notifications ====================

  async createNotification(
    tournamentId: string,
    type: string,
    titleRu: string,
    titleEn: string,
    messageRu?: string,
    messageEn?: string,
  ) {
    await this.db.insert(tournamentNotifications).values({
      tournamentId,
      type,
      title: titleRu,
      titleEn,
      titleRu,
      message: messageRu ?? null,
      messageEn: messageEn ?? null,
      messageRu: messageRu ?? null,
    });
  }

  async getNotifications(tournamentId: string, limit = 50) {
    return this.db
      .select()
      .from(tournamentNotifications)
      .where(eq(tournamentNotifications.tournamentId, tournamentId))
      .orderBy(desc(tournamentNotifications.createdAt))
      .limit(limit);
  }

  // ==================== Format for API response ====================

  async formatTournamentResponse(tournament: typeof tournaments.$inferSelect, userId?: string) {
    const participantCount = await this.getParticipantCount(tournament.id);
    const teamCount = await this.getTeamCount(tournament.id);

    let hasPaid: boolean | undefined;
    let myTeamId: string | null | undefined;

    if (userId) {
      const participant = await this.getParticipant(tournament.id, userId);
      hasPaid = !!participant;
      myTeamId = participant?.teamId ?? null;
    }

    const totalPrizePool = (BigInt(tournament.prizePool) + BigInt(tournament.bonusPool)).toString();

    return {
      id: tournament.id,
      title: tournament.title,
      description: tournament.description,
      titleEn: tournament.titleEn,
      titleRu: tournament.titleRu,
      descriptionEn: tournament.descriptionEn,
      descriptionRu: tournament.descriptionRu,
      status: tournament.status,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      bonusPool: tournament.bonusPool,
      totalPrizePool,
      commissionBps: tournament.commissionBps,
      prizeDistribution: tournament.prizeDistribution as PrizeDistEntry[],
      scoringConfig: tournament.scoringConfig as ScoringConfig,
      teamConfig: tournament.teamConfig as TeamConfig,
      maxParticipants: tournament.maxParticipants,
      participantCount,
      teamCount,
      registrationStartsAt: tournament.registrationStartsAt.toISOString(),
      registrationEndsAt: tournament.registrationEndsAt.toISOString(),
      startsAt: tournament.startsAt.toISOString(),
      endsAt: tournament.endsAt.toISOString(),
      hasPaid,
      myTeamId,
      createdAt: tournament.createdAt.toISOString(),
    };
  }
}

export const tournamentService = new TournamentService();
