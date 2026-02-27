/**
 * Announcement Service — sponsored announcements + admin deletion.
 *
 * Players pay a configurable price to submit announcements for admin review.
 * On approval, announcements are auto-published at the scheduled time.
 * On rejection, the price is refunded to the user's available balance.
 */

import { eq, sql, and, desc, lte, isNull, or } from 'drizzle-orm';
import { announcements, users, userNotifications, treasuryLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { configService } from './config.service.js';
import { vaultService } from './vault.service.js';
import { wsService } from './ws.service.js';

class AnnouncementService {
  /** Get sponsored announcement config */
  async getConfig() {
    const [price, isActive, minDelay, maxTitle, maxMessage] = await Promise.all([
      configService.getString('SPONSORED_PRICE', '100000000'),
      configService.getBoolean('SPONSORED_IS_ACTIVE', true),
      configService.getNumber('SPONSORED_MIN_DELAY_MIN', 60),
      configService.getNumber('SPONSORED_MAX_TITLE', 200),
      configService.getNumber('SPONSORED_MAX_MESSAGE', 1000),
    ]);
    return { price, isActive, minDelayMinutes: minDelay, maxTitleLength: maxTitle, maxMessageLength: maxMessage };
  }

  /** Submit a sponsored announcement request (player-initiated) */
  async submitSponsored(
    userId: string,
    title: string,
    message: string,
    scheduledAt: string | null,
  ) {
    const config = await this.getConfig();

    if (!config.isActive) {
      throw new AppError('SPONSORED_DISABLED', 'Sponsored announcements are currently disabled', 400);
    }
    if (title.length > config.maxTitleLength) {
      throw new AppError('VALIDATION_ERROR', `Title exceeds max length of ${config.maxTitleLength}`, 400);
    }
    if (message.length > config.maxMessageLength) {
      throw new AppError('VALIDATION_ERROR', `Message exceeds max length of ${config.maxMessageLength}`, 400);
    }

    // Validate scheduling
    if (scheduledAt) {
      const scheduled = new Date(scheduledAt);
      const minTime = new Date(Date.now() + config.minDelayMinutes * 60 * 1000);
      if (scheduled < minTime) {
        throw new AppError('VALIDATION_ERROR', `Scheduled time must be at least ${config.minDelayMinutes} minutes from now`, 400);
      }
    }

    // Deduct payment
    const deducted = await vaultService.deductBalance(userId, config.price);
    if (!deducted) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient balance', 400);
    }

    const db = getDb();

    // Insert announcement with pending status — refund on failure
    let ann: { id: string } | undefined;
    try {
      const [row] = await db
        .insert(announcements)
        .values({
          title,
          message,
          priority: 'sponsored',
          userId,
          status: 'pending',
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          pricePaid: config.price,
        })
        .returning({ id: announcements.id });
      ann = row;
    } catch (err) {
      // Compensating refund — balance was already deducted
      await vaultService.creditAvailable(userId, config.price);
      logger.error({ err, userId }, 'Sponsored announcement insert failed, refunded');
      throw err;
    }

    // Record in treasury ledger
    await db.insert(treasuryLedger).values({
      txhash: `announcement_${ann!.id}`,
      amount: config.price,
      denom: 'COIN',
      source: 'sponsored_announcement',
    });

    logger.info({ announcementId: ann!.id, userId, price: config.price }, 'Sponsored announcement submitted');
    return { id: ann!.id, price: config.price };
  }

  /** Approve a pending sponsored announcement (admin) */
  async approveSponsored(announcementId: string) {
    const db = getDb();

    const [ann] = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.status, 'pending')))
      .limit(1);

    if (!ann) throw new AppError('NOT_FOUND', 'Announcement not found or not pending', 404);

    const now = new Date();
    const shouldPublishNow = !ann.scheduledAt || ann.scheduledAt <= now;

    if (shouldPublishNow) {
      // Publish immediately
      await this.publishAnnouncement(announcementId);
    } else {
      // Mark as approved, will be published by background sweep
      await db
        .update(announcements)
        .set({ status: 'approved', reviewedAt: now })
        .where(eq(announcements.id, announcementId));
    }

    logger.info({ announcementId, immediate: shouldPublishNow }, 'Sponsored announcement approved');
    return { status: shouldPublishNow ? 'published' : 'approved' };
  }

  /** Reject a pending sponsored announcement (admin) */
  async rejectSponsored(announcementId: string, reason?: string) {
    const db = getDb();

    const [ann] = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, announcementId), eq(announcements.status, 'pending')))
      .limit(1);

    if (!ann) throw new AppError('NOT_FOUND', 'Announcement not found or not pending', 404);

    await db
      .update(announcements)
      .set({
        status: 'rejected',
        reviewedAt: new Date(),
        rejectedReason: reason ?? null,
      })
      .where(eq(announcements.id, announcementId));

    // Refund to available balance (user paid from available, refund goes back there)
    if (ann.userId && ann.pricePaid) {
      await vaultService.creditAvailable(ann.userId, ann.pricePaid);

      // Record refund in treasury ledger
      await db.insert(treasuryLedger).values({
        txhash: `refund_announcement_${announcementId}`,
        amount: ann.pricePaid,
        denom: 'COIN',
        source: 'sponsored_announcement_refund',
      });

      logger.info({ announcementId, userId: ann.userId, refund: ann.pricePaid }, 'Sponsored announcement rejected, refunded to available');
    }

    return { status: 'rejected' };
  }

  /** Publish a specific announcement — creates notifications + WS broadcast */
  private async publishAnnouncement(announcementId: string) {
    const db = getDb();

    // Get announcement data first
    const [ann] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);

    if (!ann) return;

    // Resolve sponsor info for notifications + WS broadcast
    let sponsorAddress: string | null = null;
    let sponsorNickname: string | null = null;
    if (ann.userId) {
      const [sponsor] = await db
        .select({ address: users.address, nickname: users.profileNickname })
        .from(users)
        .where(eq(users.id, ann.userId))
        .limit(1);
      if (sponsor) {
        sponsorAddress = sponsor.address;
        sponsorNickname = sponsor.nickname;
      }
    }

    // Insert notifications for all users via INSERT...SELECT (no memory load)
    const metadata = JSON.stringify({
      announcementId: ann.id,
      priority: ann.priority,
      sponsorAddress,
      sponsorNickname,
    });
    try {
      await db.execute(sql`
        INSERT INTO user_notifications (user_id, type, title, message, metadata)
        SELECT
          u.id,
          'announcement',
          ${ann.title},
          ${ann.message},
          ${metadata}::jsonb
        FROM users u
      `);
    } catch (err) {
      logger.error({ err, announcementId }, 'Failed to insert announcement notifications');
    }

    // Get count via Drizzle type-safe query (avoids raw SQL casting issues)
    const countResult = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(users);
    const sentCount = countResult[0]?.cnt ?? 0;

    await db
      .update(announcements)
      .set({ status: 'published', sentCount, reviewedAt: new Date() })
      .where(eq(announcements.id, announcementId));

    wsService.broadcast({
      type: 'announcement',
      data: {
        id: ann.id,
        title: ann.title,
        message: ann.message,
        priority: ann.priority,
        sponsorAddress,
        sponsorNickname,
      },
    });
  }

  /** Background sweep: publish approved announcements whose scheduledAt has passed */
  async publishScheduled(): Promise<number> {
    const db = getDb();
    const now = new Date();

    const pending = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(
        and(
          eq(announcements.status, 'approved'),
          or(
            lte(announcements.scheduledAt, now),
            isNull(announcements.scheduledAt),
          ),
        ),
      );

    for (const ann of pending) {
      try {
        await this.publishAnnouncement(ann.id);
        logger.info({ announcementId: ann.id }, 'Scheduled announcement published');
      } catch (err) {
        logger.error({ err, announcementId: ann.id }, 'Failed to publish scheduled announcement');
      }
    }

    return pending.length;
  }

  /** Soft delete an announcement (admin) + mark related notifications as read */
  async deleteAnnouncement(announcementId: string) {
    const db = getDb();
    await db
      .update(announcements)
      .set({ status: 'deleted' })
      .where(eq(announcements.id, announcementId));

    // Mark all unread notifications for this announcement as read
    // so users don't see deleted announcement popups
    await db.execute(sql`
      UPDATE user_notifications
      SET read = true
      WHERE type = 'announcement'
        AND read = false
        AND metadata->>'announcementId' = ${announcementId}
    `);
  }

  /** Get published announcements by user address (for profile page) */
  async getByUserAddress(address: string): Promise<Array<{
    id: string;
    title: string;
    message: string;
    priority: string;
    createdAt: string;
  }>> {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT a.id, a.title, a.message, a.priority, a.created_at
      FROM announcements a
      JOIN users u ON u.id = a.user_id
      WHERE u.address = ${address}
        AND a.status = 'published'
      ORDER BY a.created_at DESC
      LIMIT 20
    `) as unknown as Array<{
      id: string;
      title: string;
      message: string;
      priority: string;
      created_at: Date | string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      priority: r.priority,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  /** Get pending sponsored announcements (admin) */
  async getPending() {
    const db = getDb();
    const rows = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        message: announcements.message,
        userId: announcements.userId,
        scheduledAt: announcements.scheduledAt,
        pricePaid: announcements.pricePaid,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(eq(announcements.status, 'pending'))
      .orderBy(desc(announcements.createdAt));

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
      message: r.message,
      userId: r.userId,
      userAddress: r.userId ? userMap.get(r.userId)?.address : null,
      userNickname: r.userId ? userMap.get(r.userId)?.nickname : null,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      pricePaid: r.pricePaid,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const announcementService = new AnnouncementService();
