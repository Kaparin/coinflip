/**
 * Sponsored Raffle Service — players create raffles.
 *
 * Fee (commission) paid in COIN (virtual).
 * Prize pool paid in AXM (from vault balance).
 * Prize distributed to winner as native AXM on-chain.
 *
 * Raffles are auto-published (no admin approval needed).
 * If startsAt > 1 hour from now → only visible to creator, can edit/cancel.
 * Once within 1 hour of start → visible to all, locked (no changes).
 * On cancel: full refund (COIN fee + AXM prize separately).
 */

import { eq, sql, and, desc, gte } from 'drizzle-orm';
import { events, eventParticipants, users, treasuryLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { configService } from './config.service.js';
import { vaultService } from './vault.service.js';
import { eventsService } from './events.service.js';
import { wsService } from './ws.service.js';
import { gameDenom } from '../config/env.js';
import { translationService } from './translation.service.js';

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
   * Deducts COIN fee from coinBalance + AXM prize from vault balance.
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

    // Validate prize amount (minimum 1 AXM = 1_000_000 uaxm)
    const prizeNum = BigInt(prizeAmount);
    if (prizeNum < 1_000_000n) {
      throw new AppError('VALIDATION_ERROR', 'Prize amount must be at least 1 AXM', 400);
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

    // 1) Deduct COIN fee from coinBalance
    const feeDeducted = await vaultService.deductCoin(userId, config.price);
    if (!feeDeducted) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient COIN balance for service fee', 400);
    }

    // 2) Lock AXM prize in vault (available → locked). Sweep will collect later.
    const prizeLocked = await vaultService.lockFunds(userId, prizeAmount);
    if (!prizeLocked) {
      // Refund COIN fee since AXM lock failed
      await vaultService.creditCoin(userId, config.price);
      throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient AXM balance for prize pool', 400);
    }

    const db = getDb();

    // Resolve user address for createdBy
    const [userRow] = await db
      .select({ address: users.address })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Auto-translate title + description
    const i18n = await translationService.translateEvent(title, description);

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
          sponsoredStatus: 'approved',
          pricePaid: config.price,
          titleEn: i18n.titleEn,
          titleRu: i18n.titleRu,
          descriptionEn: i18n.descriptionEn,
          descriptionRu: i18n.descriptionRu,
        })
        .returning({ id: events.id });
      eventRow = row;
    } catch (err) {
      // Compensating refund — COIN fee + unlock AXM prize
      await vaultService.creditCoin(userId, config.price);
      await vaultService.unlockFunds(userId, prizeAmount);
      logger.error({ err, userId }, 'Sponsored raffle insert failed, refunded');
      throw err;
    }

    // Record service fee in treasury ledger
    await db.insert(treasuryLedger).values({
      txhash: `raffle_${eventRow!.id}`,
      amount: config.price,
      denom: gameDenom(),
      source: 'sponsored_raffle',
    });

    logger.info({ eventId: eventRow!.id, userId, fee: config.price, prize: prizeAmount }, 'Sponsored raffle submitted');
    return { id: eventRow!.id, fee: config.price, prize: prizeAmount };
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

    // Refund COIN fee + unlock AXM prize
    if (event.userId) {
      if (event.pricePaid) {
        await vaultService.creditCoin(event.userId, event.pricePaid);
      }
      if (event.totalPrizePool) {
        await vaultService.unlockFunds(event.userId, event.totalPrizePool);
      }

      await db.insert(treasuryLedger).values({
        txhash: `refund_raffle_${eventId}`,
        amount: event.pricePaid ?? '0',
        denom: gameDenom(),
        source: 'sponsored_raffle_refund',
      });

      logger.info({ eventId, userId: event.userId, feeRefund: event.pricePaid, prizeRefund: event.totalPrizePool }, 'Sponsored raffle rejected, refunded');
    }

    return { status: 'rejected' };
  }

  /**
   * Cancel a sponsored raffle (by creator).
   * Only allowed if startsAt > now + 1 hour. Full refund (COIN fee + AXM prize).
   */
  async cancelSponsored(eventId: string, userId: string) {
    const db = getDb();

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .limit(1);

    if (!event) throw new AppError('NOT_FOUND', 'Raffle not found', 404);
    if (event.sponsoredStatus !== 'approved' || !['draft', 'active'].includes(event.status)) {
      throw new AppError('INVALID_STATE', 'Cannot cancel this raffle', 400);
    }

    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (event.startsAt <= oneHourFromNow) {
      throw new AppError('VALIDATION_ERROR', 'Cannot cancel raffle less than 1 hour before start', 400);
    }

    // Delete participants if any
    await db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));

    // Archive the event
    await db
      .update(events)
      .set({ status: 'archived', sponsoredStatus: 'canceled' })
      .where(eq(events.id, eventId));

    // Refund COIN fee + unlock AXM prize
    if (event.pricePaid) {
      await vaultService.creditCoin(userId, event.pricePaid);
    }
    if (event.totalPrizePool) {
      await vaultService.unlockFunds(userId, event.totalPrizePool);
    }

    // Record refund in treasury ledger
    await db.insert(treasuryLedger).values({
      txhash: `refund_raffle_${eventId}`,
      amount: event.pricePaid ?? '0',
      denom: gameDenom(),
      source: 'sponsored_raffle_refund',
    });

    logger.info({ eventId, userId, feeRefund: event.pricePaid, prizeRefund: event.totalPrizePool }, 'Sponsored raffle canceled by creator, refunded');

    wsService.broadcast({
      type: 'event_canceled',
      data: { eventId, title: event.title, type: event.type },
    });

    return { status: 'canceled', feeRefund: event.pricePaid, prizeRefund: event.totalPrizePool };
  }

  /**
   * Update a sponsored raffle (by creator).
   * Only allowed if current startsAt > now + 1 hour and status is still 'draft'.
   * Can change: startsAt, endsAt.
   */
  async updateSponsored(
    eventId: string,
    userId: string,
    updates: { startsAt?: string; endsAt?: string },
  ) {
    const db = getDb();
    const config = await this.getConfig();

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .limit(1);

    if (!event) throw new AppError('NOT_FOUND', 'Raffle not found', 404);
    if (event.status !== 'draft' || event.sponsoredStatus !== 'approved') {
      throw new AppError('INVALID_STATE', 'Cannot edit this raffle', 400);
    }

    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (event.startsAt <= oneHourFromNow) {
      throw new AppError('VALIDATION_ERROR', 'Cannot edit raffle less than 1 hour before start', 400);
    }

    const newStartsAt = updates.startsAt ? new Date(updates.startsAt) : event.startsAt;
    const newEndsAt = updates.endsAt ? new Date(updates.endsAt) : event.endsAt;

    // Validate new start time (at least 5 min from now)
    if (newStartsAt.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new AppError('VALIDATION_ERROR', 'Start time must be at least 5 minutes from now', 400);
    }

    // Validate duration
    const durationHours = (newEndsAt.getTime() - newStartsAt.getTime()) / (1000 * 60 * 60);
    if (durationHours < config.minDurationHours) {
      throw new AppError('VALIDATION_ERROR', `Duration must be at least ${config.minDurationHours} hour(s)`, 400);
    }
    if (durationHours > config.maxDurationHours) {
      throw new AppError('VALIDATION_ERROR', `Duration must be at most ${config.maxDurationHours} hours`, 400);
    }

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.startsAt) set.startsAt = newStartsAt;
    if (updates.endsAt) set.endsAt = newEndsAt;

    await db.update(events).set(set).where(eq(events.id, eventId));
    logger.info({ eventId, userId, updates }, 'Sponsored raffle updated by creator');

    return { status: 'updated' };
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
