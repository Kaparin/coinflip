/**
 * Sponsored Raffle Service — players pay LAUNCH to create raffles for admin review.
 *
 * Pattern mirrors AnnouncementService:
 *   submit → pending → admin approve/reject → activate (lifecycle manages)
 * On reject: full refund (service fee + prize pool).
 */

import { eq, sql, and, desc } from 'drizzle-orm';
import { events, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { configService } from './config.service.js';
import { vaultService } from './vault.service.js';
import { eventsService } from './events.service.js';
import { wsService } from './ws.service.js';

class SponsoredRaffleService {
  /** Load config from platform_config */
  async getConfig() {
    const [price, isActive, maxTitle, maxDesc, minDurationHours, maxDurationHours] = await Promise.all([
      configService.getString('SPONSORED_RAFFLE_PRICE', '500000000'),
      configService.getBoolean('SPONSORED_RAFFLE_IS_ACTIVE', true),
      configService.getNumber('SPONSORED_RAFFLE_MAX_TITLE', 100),
      configService.getNumber('SPONSORED_RAFFLE_MAX_DESC', 500),
      configService.getNumber('SPONSORED_RAFFLE_MIN_DURATION_HOURS', 1),
      configService.getNumber('SPONSORED_RAFFLE_MAX_DURATION_HOURS', 168),
    ]);
    return { price, isActive, maxTitle, maxDesc, minDurationHours, maxDurationHours };
  }

  /**
   * Submit a sponsored raffle.
   * Deducts service fee + prize pool from user's vault balance.
   */
  async submitSponsored(
    userId: string,
    title: string,
    description: string,
    prizeAmount: string,
    startsAt: string,
    endsAt: string,
  ) {
    const config = await this.getConfig();

    if (!config.isActive) {
      throw new AppError('SPONSORED_DISABLED', 'Sponsored raffles are currently disabled', 400);
    }
    if (title.length > config.maxTitle) {
      throw new AppError('VALIDATION_ERROR', `Title exceeds max length of ${config.maxTitle}`, 400);
    }
    if (description.length > config.maxDesc) {
      throw new AppError('VALIDATION_ERROR', `Description exceeds max length of ${config.maxDesc}`, 400);
    }

    // Validate prize amount (minimum 1 LAUNCH = 1_000_000 micro)
    const prizeNum = BigInt(prizeAmount);
    if (prizeNum < 1_000_000n) {
      throw new AppError('VALIDATION_ERROR', 'Prize amount must be at least 1 LAUNCH', 400);
    }

    // Validate duration
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (durationHours < config.minDurationHours) {
      throw new AppError('VALIDATION_ERROR', `Duration must be at least ${config.minDurationHours} hour(s)`, 400);
    }
    if (durationHours > config.maxDurationHours) {
      throw new AppError('VALIDATION_ERROR', `Duration must be at most ${config.maxDurationHours} hours`, 400);
    }

    // startsAt must be in the future (at least 5 min)
    if (start.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new AppError('VALIDATION_ERROR', 'Start time must be at least 5 minutes from now', 400);
    }

    // Total cost = service fee + prize pool
    const totalCost = (BigInt(config.price) + prizeNum).toString();

    // Deduct payment
    const deducted = await vaultService.deductBalance(userId, totalCost);
    if (!deducted) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient balance', 400);
    }

    const db = getDb();

    // Resolve user address for createdBy
    const [userRow] = await db
      .select({ address: users.address })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let eventRow: { id: string } | undefined;
    try {
      const [row] = await db
        .insert(events)
        .values({
          type: 'raffle',
          title,
          description,
          status: 'draft',
          startsAt: start,
          endsAt: end,
          config: JSON.stringify({ maxParticipants: null }),
          prizes: JSON.stringify([{ place: 1, amount: prizeAmount }]),
          totalPrizePool: prizeAmount,
          createdBy: userRow?.address ?? 'sponsored',
          userId,
          sponsoredStatus: 'pending',
          pricePaid: totalCost,
        })
        .returning({ id: events.id });
      eventRow = row;
    } catch (err) {
      // Compensating refund
      await vaultService.creditAvailable(userId, totalCost);
      logger.error({ err, userId }, 'Sponsored raffle insert failed, refunded');
      throw err;
    }

    logger.info({ eventId: eventRow!.id, userId, totalCost }, 'Sponsored raffle submitted');
    return { id: eventRow!.id, totalCost };
  }

  /** Approve a pending sponsored raffle (admin) */
  async approveSponsored(eventId: string) {
    const db = getDb();

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.sponsoredStatus, 'pending')))
      .limit(1);

    if (!event) throw new AppError('NOT_FOUND', 'Sponsored raffle not found or not pending', 404);

    const now = new Date();

    // Mark as approved
    await db
      .update(events)
      .set({ sponsoredStatus: 'approved', reviewedAt: now })
      .where(eq(events.id, eventId));

    // If startsAt is in the past or now, activate immediately
    if (event.startsAt <= now) {
      const activated = await eventsService.setStatus(eventId, 'active');
      if (activated) {
        const broadcastData = await eventsService.buildEventStartedData(event);
        wsService.broadcast({ type: 'event_started', data: broadcastData });
        logger.info({ eventId }, 'Sponsored raffle approved and activated immediately');
        return { status: 'activated' };
      }
    }

    // Otherwise leave as draft — lifecycle will activate when startsAt arrives
    logger.info({ eventId, startsAt: event.startsAt }, 'Sponsored raffle approved, awaiting scheduled start');
    return { status: 'approved' };
  }

  /** Reject a pending sponsored raffle (admin) + refund */
  async rejectSponsored(eventId: string, reason?: string) {
    const db = getDb();

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.sponsoredStatus, 'pending')))
      .limit(1);

    if (!event) throw new AppError('NOT_FOUND', 'Sponsored raffle not found or not pending', 404);

    await db
      .update(events)
      .set({
        sponsoredStatus: 'rejected',
        status: 'archived',
        rejectedReason: reason ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    // Refund the full amount (service fee + prize pool)
    if (event.userId && event.pricePaid) {
      await vaultService.creditAvailable(event.userId, event.pricePaid);
      logger.info({ eventId, userId: event.userId, refund: event.pricePaid }, 'Sponsored raffle rejected, refunded');
    }

    return { status: 'rejected' };
  }

  /** Get pending sponsored raffles (admin panel) */
  async getPending() {
    const db = getDb();

    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        totalPrizePool: events.totalPrizePool,
        pricePaid: events.pricePaid,
        userId: events.userId,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.sponsoredStatus, 'pending'))
      .orderBy(desc(events.createdAt));

    // Resolve user addresses
    const userIds = rows.filter((r) => r.userId).map((r) => r.userId!);
    const userMap = new Map<string, { address: string; nickname: string | null }>();

    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, address: users.address, nickname: users.profileNickname })
        .from(users)
        .where(sql`${users.id} = ANY(${userIds})`);
      for (const u of userRows) {
        userMap.set(u.id, { address: u.address, nickname: u.nickname });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      totalPrizePool: r.totalPrizePool ?? '0',
      pricePaid: r.pricePaid,
      userId: r.userId,
      userAddress: r.userId ? userMap.get(r.userId)?.address ?? null : null,
      userNickname: r.userId ? userMap.get(r.userId)?.nickname ?? null : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const sponsoredRaffleService = new SponsoredRaffleService();
