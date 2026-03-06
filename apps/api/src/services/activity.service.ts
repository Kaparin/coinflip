/**
 * Activity Service — unified chronological feed of all user operations.
 *
 * Combines bet wins/losses, referral rewards, jackpot wins, shop purchases, and VIP purchases via UNION ALL.
 * Cursor-based pagination by timestamp.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export type ActivityType = 'bet_win' | 'bet_loss' | 'referral_reward' | 'jackpot_win' | 'shop_purchase' | 'vip_purchase' | 'transfer_sent' | 'transfer_received' | 'deposit' | 'withdrawal' | 'event_prize' | 'achievement_claim';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  amount: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

class ActivityService {
  async getUserActivity(
    userId: string,
    options: { cursor?: string; limit?: number; types?: string[] } = {},
  ): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
    const db = getDb();
    const limit = options.limit ?? 20;
    const cursorCondition = options.cursor
      ? sql`AND sub.ts < ${options.cursor}::timestamptz`
      : sql``;

    // Build type filter
    const allowedTypes = options.types?.length
      ? options.types
      : ['bet_win', 'bet_loss', 'referral_reward', 'jackpot_win', 'shop_purchase', 'vip_purchase', 'transfer_sent', 'transfer_received', 'deposit', 'withdrawal', 'event_prize', 'achievement_claim'];

    const unionParts: ReturnType<typeof sql>[] = [];

    // Bet wins
    if (allowedTypes.includes('bet_win')) {
      unionParts.push(sql`
        SELECT
          'bet_win_' || b.bet_id AS id,
          'bet_win' AS type,
          (b.payout_amount::numeric - b.amount::numeric)::text AS amount,
          b.resolved_time AS ts,
          jsonb_build_object(
            'betId', b.bet_id,
            'totalAmount', b.amount,
            'payoutAmount', b.payout_amount,
            'opponentAddress', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT address FROM users WHERE id = b.acceptor_user_id)
              ELSE (SELECT address FROM users WHERE id = b.maker_user_id)
            END,
            'opponentNickname', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT profile_nickname FROM users WHERE id = b.acceptor_user_id)
              ELSE (SELECT profile_nickname FROM users WHERE id = b.maker_user_id)
            END,
            'opponentVipTier', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.acceptor_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1)
              ELSE (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.maker_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1)
            END
          ) AS metadata
        FROM bets b
        WHERE b.winner_user_id = ${userId}
          AND b.status IN ('revealed', 'timeout_claimed')
      `);
    }

    // Bet losses
    if (allowedTypes.includes('bet_loss')) {
      unionParts.push(sql`
        SELECT
          'bet_loss_' || b.bet_id AS id,
          'bet_loss' AS type,
          b.amount::text AS amount,
          b.resolved_time AS ts,
          jsonb_build_object(
            'betId', b.bet_id,
            'totalAmount', b.amount,
            'opponentAddress', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT address FROM users WHERE id = b.maker_user_id)
              ELSE (SELECT address FROM users WHERE id = b.acceptor_user_id)
            END,
            'opponentNickname', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT profile_nickname FROM users WHERE id = b.maker_user_id)
              ELSE (SELECT profile_nickname FROM users WHERE id = b.acceptor_user_id)
            END,
            'opponentVipTier', CASE WHEN b.winner_user_id = b.maker_user_id
              THEN (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.maker_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1)
              ELSE (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.acceptor_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1)
            END
          ) AS metadata
        FROM bets b
        WHERE b.winner_user_id IS NOT NULL
          AND b.winner_user_id != ${userId}
          AND (b.maker_user_id = ${userId} OR b.acceptor_user_id = ${userId})
          AND b.status IN ('revealed', 'timeout_claimed')
      `);
    }

    // Referral rewards
    if (allowedTypes.includes('referral_reward')) {
      unionParts.push(sql`
        SELECT
          'ref_' || rr.id AS id,
          'referral_reward' AS type,
          rr.amount::text AS amount,
          rr.created_at AS ts,
          jsonb_build_object(
            'level', rr.level,
            'fromPlayerAddress', (SELECT address FROM users WHERE id = rr.from_player_user_id),
            'fromPlayerNickname', (SELECT profile_nickname FROM users WHERE id = rr.from_player_user_id),
            'fromPlayerVipTier', (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = rr.from_player_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1),
            'betId', rr.bet_id
          ) AS metadata
        FROM referral_rewards rr
        WHERE rr.recipient_user_id = ${userId}
      `);
    }

    // Jackpot wins
    if (allowedTypes.includes('jackpot_win')) {
      unionParts.push(sql`
        SELECT
          'jackpot_' || jp.id AS id,
          'jackpot_win' AS type,
          jp.current_amount::text AS amount,
          jp.completed_at AS ts,
          jsonb_build_object(
            'poolId', jp.id,
            'tierId', jp.tier_id,
            'tierName', jt.name,
            'cycle', jp.cycle
          ) AS metadata
        FROM jackpot_pools jp
        INNER JOIN jackpot_tiers jt ON jt.id = jp.tier_id
        WHERE jp.winner_user_id = ${userId}
          AND jp.status = 'completed'
      `);
    }

    // Shop purchases
    if (allowedTypes.includes('shop_purchase')) {
      unionParts.push(sql`
        SELECT
          'shop_' || sp.id AS id,
          'shop_purchase' AS type,
          sp.coin_amount::text AS amount,
          sp.created_at AS ts,
          jsonb_build_object(
            'chestTier', sp.chest_tier,
            'axmAmount', sp.axm_amount,
            'coinAmount', sp.coin_amount,
            'bonusCredited', sp.bonus_credited
          ) AS metadata
        FROM shop_purchases sp
        WHERE sp.user_id = ${userId}
          AND sp.status = 'confirmed'
      `);
    }

    // VIP purchases
    if (allowedTypes.includes('vip_purchase')) {
      unionParts.push(sql`
        SELECT
          'vip_' || vs.id AS id,
          'vip_purchase' AS type,
          vs.price_paid::text AS amount,
          vs.created_at AS ts,
          jsonb_build_object(
            'tier', vs.tier,
            'pricePaid', vs.price_paid,
            'expiresAt', vs.expires_at
          ) AS metadata
        FROM vip_subscriptions vs
        WHERE vs.user_id = ${userId}
      `);
    }

    // Transfers sent
    if (allowedTypes.includes('transfer_sent')) {
      unionParts.push(sql`
        SELECT
          'transfer_sent_' || ct.id AS id,
          'transfer_sent' AS type,
          ct.amount::text AS amount,
          ct.created_at AS ts,
          jsonb_build_object(
            'recipientAddress', (SELECT address FROM users WHERE id = ct.recipient_id),
            'recipientNickname', (SELECT profile_nickname FROM users WHERE id = ct.recipient_id),
            'recipientVipTier', (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = ct.recipient_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1),
            'currency', ct.currency,
            'fee', ct.fee,
            'message', ct.message
          ) AS metadata
        FROM coin_transfers ct
        WHERE ct.sender_id = ${userId}
      `);
    }

    // Transfers received
    if (allowedTypes.includes('transfer_received')) {
      unionParts.push(sql`
        SELECT
          'transfer_received_' || ct.id AS id,
          'transfer_received' AS type,
          ct.amount::text AS amount,
          ct.created_at AS ts,
          jsonb_build_object(
            'senderAddress', (SELECT address FROM users WHERE id = ct.sender_id),
            'senderNickname', (SELECT profile_nickname FROM users WHERE id = ct.sender_id),
            'senderVipTier', (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = ct.sender_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1),
            'currency', ct.currency,
            'fee', ct.fee,
            'message', ct.message
          ) AS metadata
        FROM coin_transfers ct
        WHERE ct.recipient_id = ${userId}
      `);
    }

    // Deposits
    if (allowedTypes.includes('deposit')) {
      unionParts.push(sql`
        SELECT
          'deposit_' || vt.id AS id,
          'deposit' AS type,
          vt.amount::text AS amount,
          vt.created_at AS ts,
          jsonb_build_object(
            'txHash', vt.tx_hash
          ) AS metadata
        FROM vault_transactions vt
        WHERE vt.user_id = ${userId}
          AND vt.type = 'deposit'
          AND vt.status = 'confirmed'
      `);
    }

    // Withdrawals
    if (allowedTypes.includes('withdrawal')) {
      unionParts.push(sql`
        SELECT
          'withdrawal_' || vt.id AS id,
          'withdrawal' AS type,
          vt.amount::text AS amount,
          vt.created_at AS ts,
          jsonb_build_object(
            'txHash', vt.tx_hash
          ) AS metadata
        FROM vault_transactions vt
        WHERE vt.user_id = ${userId}
          AND vt.type = 'withdraw'
          AND vt.status = 'confirmed'
      `);
    }

    // Event prizes (contests / raffles)
    if (allowedTypes.includes('event_prize')) {
      unionParts.push(sql`
        SELECT
          'event_prize_' || ep.id AS id,
          'event_prize' AS type,
          ep.prize_amount::text AS amount,
          e.ends_at AS ts,
          jsonb_build_object(
            'eventId', e.id,
            'eventTitle', e.title,
            'eventType', e.type,
            'rank', ep.final_rank
          ) AS metadata
        FROM event_participants ep
        INNER JOIN events e ON e.id = ep.event_id
        WHERE ep.user_id = ${userId}
          AND ep.prize_amount IS NOT NULL
          AND ep.prize_amount::numeric > 0
      `);
    }

    // Achievement claims
    if (allowedTypes.includes('achievement_claim')) {
      unionParts.push(sql`
        SELECT
          'achievement_' || ac.id AS id,
          'achievement_claim' AS type,
          ac.coin_amount::text AS amount,
          ac.claimed_at AS ts,
          jsonb_build_object(
            'achievementId', ac.achievement_id
          ) AS metadata
        FROM achievement_claims ac
        WHERE ac.user_id = ${userId}
      `);
    }

    if (unionParts.length === 0) {
      return { items: [], nextCursor: null };
    }

    // Combine with UNION ALL
    let unionQuery = unionParts[0]!;
    for (let i = 1; i < unionParts.length; i++) {
      unionQuery = sql`${unionQuery} UNION ALL ${unionParts[i]}`;
    }

    const rows = await db.execute(sql`
      SELECT sub.* FROM (
        ${unionQuery}
      ) sub
      WHERE sub.ts IS NOT NULL ${cursorCondition}
      ORDER BY sub.ts DESC
      LIMIT ${limit + 1}
    `) as unknown as Array<{
      id: string;
      type: string;
      amount: string;
      ts: Date | string;
      metadata: Record<string, unknown>;
    }>;

    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      type: r.type as ActivityItem['type'],
      amount: r.amount,
      timestamp: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      metadata: r.metadata,
    }));

    const nextCursor = hasNext && items.length > 0
      ? items[items.length - 1]!.timestamp
      : null;

    return { items, nextCursor };
  }
}

export const activityService = new ActivityService();
