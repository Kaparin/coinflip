/**
 * News Service — public feed aggregating news, announcements, big wins, and jackpot wins.
 *
 * Uses UNION ALL with cursor-based pagination (same pattern as activity.service.ts).
 */

import { eq, sql, desc } from 'drizzle-orm';
import { newsPosts } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { configService } from './config.service.js';

export interface NewsFeedItem {
  id: string;
  type: 'news_post' | 'announcement' | 'big_win' | 'jackpot_win';
  title: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

class NewsService {
  /** Get public news feed with cursor pagination */
  async getFeed(options: {
    cursor?: string;
    limit?: number;
    types?: string[];
  } = {}): Promise<{ items: NewsFeedItem[]; nextCursor: string | null }> {
    const db = getDb();
    const limit = options.limit ?? 20;
    const cursorCondition = options.cursor
      ? sql`AND sub.ts < ${options.cursor}::timestamptz`
      : sql``;

    const allowedTypes = options.types?.length
      ? options.types
      : ['news_post', 'announcement', 'big_win', 'jackpot_win'];

    const bigWinThreshold = await configService.getString('BIG_WIN_THRESHOLD', '500000000');

    const unionParts: ReturnType<typeof sql>[] = [];

    if (allowedTypes.includes('news_post')) {
      unionParts.push(sql`
        SELECT
          'post_' || np.id AS id,
          'news_post' AS type,
          np.title AS title,
          np.content AS content,
          np.published_at AS ts,
          jsonb_build_object('priority', np.priority, 'type', np.type) AS metadata
        FROM news_posts np
        WHERE np.is_published = 1
      `);
    }

    if (allowedTypes.includes('announcement')) {
      unionParts.push(sql`
        SELECT
          'ann_' || a.id AS id,
          'announcement' AS type,
          a.title AS title,
          a.message AS content,
          a.created_at AS ts,
          jsonb_build_object('priority', a.priority, 'sentCount', a.sent_count) AS metadata
        FROM announcements a
        WHERE a.status = 'published'
      `);
    }

    if (allowedTypes.includes('big_win')) {
      unionParts.push(sql`
        SELECT
          'bigwin_' || b.bet_id AS id,
          'big_win' AS type,
          '' AS title,
          '' AS content,
          b.resolved_time AS ts,
          jsonb_build_object(
            'betId', b.bet_id,
            'amount', b.amount,
            'payoutAmount', b.payout_amount,
            'winnerAddress', u.address,
            'winnerNickname', u.profile_nickname
          ) AS metadata
        FROM bets b
        JOIN users u ON u.id = b.winner_user_id
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.payout_amount IS NOT NULL
          AND b.payout_amount::numeric >= ${bigWinThreshold}::numeric
      `);
    }

    if (allowedTypes.includes('jackpot_win')) {
      unionParts.push(sql`
        SELECT
          'jackpot_' || jp.id AS id,
          'jackpot_win' AS type,
          '' AS title,
          '' AS content,
          jp.completed_at AS ts,
          jsonb_build_object(
            'poolId', jp.id,
            'tierName', jt.name,
            'amount', jp.current_amount,
            'winnerUserId', jp.winner_user_id,
            'winnerAddress', u.address,
            'winnerNickname', u.profile_nickname,
            'cycle', jp.cycle
          ) AS metadata
        FROM jackpot_pools jp
        JOIN jackpot_tiers jt ON jt.id = jp.tier_id
        LEFT JOIN users u ON u.id = jp.winner_user_id
        WHERE jp.status = 'completed'
      `);
    }

    if (unionParts.length === 0) {
      return { items: [], nextCursor: null };
    }

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
      title: string;
      content: string;
      ts: Date | string;
      metadata: Record<string, unknown>;
    }>;

    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      type: r.type as NewsFeedItem['type'],
      title: r.title,
      content: r.content,
      timestamp: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      metadata: r.metadata,
    }));

    const nextCursor = hasNext && items.length > 0
      ? items[items.length - 1]!.timestamp
      : null;

    return { items, nextCursor };
  }

  // ── Admin CRUD ──

  async createPost(data: { type: string; title: string; content: string; priority?: string; isPublished?: number }) {
    const db = getDb();
    const [row] = await db
      .insert(newsPosts)
      .values({
        type: data.type,
        title: data.title,
        content: data.content,
        priority: data.priority ?? 'normal',
        isPublished: data.isPublished ?? 1,
      })
      .returning();
    return row!;
  }

  async updatePost(id: string, data: { title?: string; content?: string; priority?: string; isPublished?: number }) {
    const db = getDb();
    await db
      .update(newsPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(newsPosts.id, id));
  }

  async deletePost(id: string) {
    const db = getDb();
    await db.delete(newsPosts).where(eq(newsPosts.id, id));
  }

  async listPosts(limit: number, offset: number) {
    const db = getDb();
    const [rows, countResult] = await Promise.all([
      db.select().from(newsPosts).orderBy(desc(newsPosts.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(newsPosts),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        priority: r.priority,
        isPublished: r.isPublished,
        publishedAt: r.publishedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total: countResult[0]?.count ?? 0,
    };
  }
}

export const newsService = new NewsService();
