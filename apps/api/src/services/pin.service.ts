/**
 * Pin Service — manages the 3 pinned bet slots (auction system).
 *
 * - Empty slot: costs PIN_MIN_PRICE
 * - Occupied slot: costs current_price * PIN_OUTBID_MULTIPLIER
 * - Outbid: no refund to previous holder
 * - Expired pinned bet: 50% refund to the pinner via bonus credit
 */

import crypto from 'node:crypto';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { betPins, bets, users, treasuryLedger } from '@coinflip/db/schema';
import { PIN_SLOTS, PIN_MIN_PRICE, PIN_OUTBID_MULTIPLIER, PIN_EXPIRE_REFUND_BPS } from '@coinflip/shared/constants';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { Errors } from '../lib/errors.js';
import { vaultService } from './vault.service.js';

class PinService {
  /**
   * Get all 3 pin slots with their current state.
   * Empty slots returned with null bet info and the minimum price.
   */
  async getPinSlots(): Promise<Array<{
    slot: number;
    betId: string | null;
    userId: string | null;
    userAddress: string | null;
    userNickname: string | null;
    price: string;
    outbidPrice: string;
    pinnedAt: string | null;
  }>> {
    const db = getDb();

    const pinRows = await db
      .select({
        slot: betPins.slot,
        betId: betPins.betId,
        userId: betPins.userId,
        price: betPins.price,
        pinnedAt: betPins.pinnedAt,
      })
      .from(betPins)
      .orderBy(betPins.slot);

    const pinMap = new Map(pinRows.map((r) => [r.slot, r]));

    // Get user info for occupied slots
    const userIds = pinRows.map((r) => r.userId);
    const userMap = new Map<string, { address: string; nickname: string | null }>();
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, address: users.address, nickname: users.profileNickname })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of userRows) {
        userMap.set(u.id, { address: u.address, nickname: u.nickname });
      }
    }

    const result = [];
    for (let slot = 1; slot <= PIN_SLOTS; slot++) {
      const pin = pinMap.get(slot);
      if (pin) {
        const user = userMap.get(pin.userId);
        const currentPrice = BigInt(pin.price);
        const outbidPrice = (currentPrice * BigInt(PIN_OUTBID_MULTIPLIER)).toString();
        result.push({
          slot,
          betId: pin.betId.toString(),
          userId: pin.userId,
          userAddress: user?.address ?? null,
          userNickname: user?.nickname ?? null,
          price: pin.price,
          outbidPrice,
          pinnedAt: pin.pinnedAt instanceof Date ? pin.pinnedAt.toISOString() : String(pin.pinnedAt),
        });
      } else {
        result.push({
          slot,
          betId: null,
          userId: null,
          userAddress: null,
          userNickname: null,
          price: '0',
          outbidPrice: PIN_MIN_PRICE,
          pinnedAt: null,
        });
      }
    }

    return result;
  }

  /**
   * Pin a bet to a specific slot. Handles payment and outbidding.
   */
  async pinBet(userId: string, betId: string, slot: number): Promise<void> {
    const db = getDb();

    if (slot < 1 || slot > PIN_SLOTS) {
      throw Errors.validationError(`Invalid pin slot: must be 1-${PIN_SLOTS}`);
    }

    // Verify bet exists, is open, and belongs to the user
    const [bet] = await db
      .select({ betId: bets.betId, status: bets.status, makerUserId: bets.makerUserId })
      .from(bets)
      .where(eq(bets.betId, BigInt(betId)))
      .limit(1);

    if (!bet) throw Errors.betNotFound(betId);
    if (bet.status !== 'open') throw Errors.validationError('Can only pin open bets');
    if (bet.makerUserId !== userId) throw Errors.validationError('Can only pin your own bets');

    // Check current slot state
    const [currentPin] = await db
      .select({ userId: betPins.userId, price: betPins.price, betId: betPins.betId })
      .from(betPins)
      .where(eq(betPins.slot, slot))
      .limit(1);

    let requiredPrice: string;
    if (currentPin) {
      // Slot occupied — must outbid
      if (currentPin.userId === userId && currentPin.betId === BigInt(betId)) {
        throw Errors.validationError('This bet is already pinned in this slot');
      }
      requiredPrice = (BigInt(currentPin.price) * BigInt(PIN_OUTBID_MULTIPLIER)).toString();
    } else {
      // Slot empty
      requiredPrice = PIN_MIN_PRICE;
    }

    // Deduct from user's available balance
    const deducted = await vaultService.deductBalance(userId, requiredPrice);
    if (!deducted) {
      throw Errors.insufficientBalance(requiredPrice, '(check your balance)');
    }

    // Upsert pin slot
    await db
      .insert(betPins)
      .values({
        slot,
        betId: BigInt(betId),
        userId,
        price: requiredPrice,
        pinnedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: betPins.slot,
        set: {
          betId: BigInt(betId),
          userId,
          price: requiredPrice,
          pinnedAt: new Date(),
        },
      });

    // Record revenue
    await db.insert(treasuryLedger).values({
      txhash: `pin_${crypto.randomUUID()}`,
      amount: requiredPrice,
      denom: 'LAUNCH',
      source: 'bet_pin',
    });

    logger.info(
      { userId, betId, slot, price: requiredPrice, outbid: !!currentPin },
      'Bet pinned to slot',
    );
  }

  /**
   * Clean up expired pins: remove pins whose bet is no longer open.
   * Gives 50% refund to the pinner via bonus credit.
   * Called periodically (cron every 5 minutes).
   */
  async cleanupExpiredPins(): Promise<void> {
    const db = getDb();

    try {
      // Find pins whose bet is no longer open
      const expiredPins = await db.execute(sql`
        SELECT bp.slot, bp.bet_id, bp.user_id, bp.price
        FROM bet_pins bp
        INNER JOIN bets b ON b.bet_id = bp.bet_id
        WHERE b.status != 'open'
      `) as unknown as Array<{
        slot: number;
        bet_id: string;
        user_id: string;
        price: string;
      }>;

      for (const pin of expiredPins) {
        // Delete the pin
        await db.delete(betPins).where(eq(betPins.slot, pin.slot));

        // Calculate 50% refund
        const refundAmount = ((BigInt(pin.price) * BigInt(PIN_EXPIRE_REFUND_BPS)) / 10000n).toString();

        if (BigInt(refundAmount) > 0n) {
          // Credit refund to bonus balance
          await vaultService.creditWinner(pin.user_id, refundAmount);

          logger.info(
            { slot: pin.slot, betId: pin.bet_id, userId: pin.user_id, refund: refundAmount },
            'Expired pin refund credited',
          );
        }
      }

      if (expiredPins.length > 0) {
        logger.info({ count: expiredPins.length }, 'Cleaned up expired pin slots');
      }
    } catch (err) {
      logger.error({ err }, 'Pin cleanup failed');
    }
  }
}

export const pinService = new PinService();
