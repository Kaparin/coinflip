/**
 * Activity Service — unified chronological feed of all user operations.
 *
 * Combines bet wins/losses, referral rewards, and jackpot wins via UNION ALL.
 * Cursor-based pagination by timestamp.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface ActivityItem {
  id: string;
  type: 'bet_win' | 'bet_loss' | 'referral_reward' | 'jackpot_win';
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
      : ['bet_win', 'bet_loss', 'referral_reward', 'jackpot_win'];

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
