import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/** Regex to catch URLs, domains, and common spam patterns */
const LINK_PATTERNS = [
  /https?:\/\/\S+/i,
  /www\.\S+/i,
  /\S+\.(com|net|org|io|co|me|xyz|ru|info|biz|cc|tk|ml|ga|cf|gq|gg|ly|bit|link|click|top|pro|dev|app|site|online|store|shop|club|live|fun|tech|space|website)\b/i,
  /t\.me\/\S+/i,
  /discord\.(gg|com)\/\S+/i,
  /wa\.me\/\S+/i,
];

class ChatService {
  private db = getDb();
  private lastMessageTime = new Map<string, number>();

  /** Check if message contains links/spam */
  containsLinks(message: string): boolean {
    return LINK_PATTERNS.some((pattern) => pattern.test(message));
  }

  /** Check if user can send message (3s cooldown) */
  canSend(userId: string): { allowed: boolean; waitMs: number } {
    const last = this.lastMessageTime.get(userId) ?? 0;
    const elapsed = Date.now() - last;
    const cooldown = 3000;
    if (elapsed < cooldown) {
      return { allowed: false, waitMs: cooldown - elapsed };
    }
    return { allowed: true, waitMs: 0 };
  }

  /** Save and return chat message */
  async sendMessage(userId: string, message: string): Promise<{
    id: string;
    userId: string;
    address: string;
    nickname: string | null;
    vipTier: string | null;
    message: string;
    createdAt: string;
  }> {
    this.lastMessageTime.set(userId, Date.now());

    const rows = await this.db.execute(sql`
      INSERT INTO global_chat_messages (user_id, message)
      VALUES (${userId}, ${message})
      RETURNING id::text, created_at
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const row = rawRows[0]!;

    // Get user info
    const userRows = await this.db.execute(sql`
      SELECT u.address, u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier
      FROM users u WHERE u.id = ${userId}
    `);
    const rawUserRows = (Array.isArray(userRows) ? userRows : (userRows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const user = rawUserRows[0]!;

    return {
      id: String(row.id),
      userId,
      address: String(user.address),
      nickname: user.nickname ? String(user.nickname) : null,
      vipTier: user.vip_tier ? String(user.vip_tier) : null,
      message,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }

  /** Get today's messages (since midnight UTC) */
  async getTodayMessages(): Promise<Array<{
    id: string;
    userId: string;
    address: string;
    nickname: string | null;
    vipTier: string | null;
    message: string;
    createdAt: string;
  }>> {
    const rows = await this.db.execute(sql`
      SELECT m.id::text, m.user_id::text as user_id, m.message, m.created_at,
        u.address, u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier
      FROM global_chat_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.created_at >= (NOW() AT TIME ZONE 'UTC')::date::timestamptz
      ORDER BY m.created_at ASC
      LIMIT 200
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    return rawRows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      address: String(r.address),
      nickname: r.nickname ? String(r.nickname) : null,
      vipTier: r.vip_tier ? String(r.vip_tier) : null,
      message: String(r.message),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }
}

export const chatService = new ChatService();
