import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { vaultService } from './vault.service.js';
import { aiBotService } from './ai-bot.service.js';
import { shortAddress as shortAddr } from '../lib/format.js';

/** Regex to catch URLs, domains, and common spam patterns */
const LINK_PATTERNS = [
  /https?:\/\/\S+/i,
  /www\.\S+/i,
  /\S+\.(com|net|org|io|co|me|xyz|ru|info|biz|cc|tk|ml|ga|cf|gq|gg|ly|bit|link|click|top|pro|dev|app|site|online|store|shop|club|live|fun|tech|space|website)\b/i,
  /t\.me\/\S+/i,
  /discord\.(gg|com)\/\S+/i,
  /wa\.me\/\S+/i,
];

const MICRO = 1_000_000;

/** Prices in micro-COIN */
export const CHAT_PRICES = {
  highlighted: 10 * MICRO,   // 10 COIN — golden border message
  pinned: 50 * MICRO,        // 50 COIN — super chat, pinned at top
  effect: 5 * MICRO,         // 5 COIN — message with visual effect
  coinDropMin: 1 * MICRO,    // 1 COIN minimum for coin drop
} as const;

export const VALID_STYLES = ['highlighted', 'pinned', 'coin_drop'] as const;
export const VALID_EFFECTS = ['confetti', 'coins', 'fire'] as const;

export type ChatStyle = typeof VALID_STYLES[number] | null;
export type ChatEffect = typeof VALID_EFFECTS[number] | null;

interface ChatMsg {
  id: string;
  userId: string;
  address: string;
  nickname: string | null;
  vipTier: string | null;
  message: string;
  style: string | null;
  effect: string | null;
  createdAt: string;
  coinDrop?: {
    dropId: string;
    amount: string;
    claimedBy: string | null;
    claimedByNickname: string | null;
  };
}

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

  /** Calculate cost for message options */
  calculateCost(style: ChatStyle, effect: ChatEffect): number {
    let cost = 0;
    if (style === 'highlighted') cost += CHAT_PRICES.highlighted;
    if (style === 'pinned') cost += CHAT_PRICES.pinned;
    if (effect) cost += CHAT_PRICES.effect;
    return cost;
  }

  /** Get user info helper */
  private async getUserInfo(userId: string) {
    const userRows = await this.db.execute(sql`
      SELECT u.address, u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier
      FROM users u WHERE u.id = ${userId}
    `);
    const rawUserRows = (Array.isArray(userRows) ? userRows : (userRows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    return rawUserRows[0]!;
  }

  /** Save and return chat message */
  async sendMessage(
    userId: string,
    message: string,
    style: ChatStyle = null,
    effect: ChatEffect = null,
  ): Promise<ChatMsg> {
    this.lastMessageTime.set(userId, Date.now());

    // Deduct payment if premium features used (from COIN balance, not CW20 vault)
    const cost = this.calculateCost(style, effect);
    if (cost > 0) {
      const deducted = await vaultService.deductCoin(userId, cost.toString());
      if (!deducted) {
        throw new Error('INSUFFICIENT_BALANCE');
      }
    }

    const styleVal = style ?? null;
    const effectVal = effect ?? null;

    const rows = await this.db.execute(sql`
      INSERT INTO global_chat_messages (user_id, message, style, effect)
      VALUES (${userId}, ${message}, ${styleVal}, ${effectVal})
      RETURNING id::text, created_at
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const row = rawRows[0]!;

    const user = await this.getUserInfo(userId);

    const chatMsg: ChatMsg = {
      id: String(row.id),
      userId,
      address: String(user.address),
      nickname: user.nickname ? String(user.nickname) : null,
      vipTier: user.vip_tier ? String(user.vip_tier) : null,
      message,
      style: styleVal,
      effect: effectVal,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };

    // Fire-and-forget: check if AI bot should respond
    aiBotService.onChatMessage(
      message,
      chatMsg.nickname ?? shortAddr(chatMsg.address),
      chatMsg.address,
    ).catch(err => logger.error({ err }, 'AI bot chat response failed'));

    return chatMsg;
  }

  /** Send a COIN drop message — deducts from sender, creates claimable drop */
  async sendCoinDrop(
    userId: string,
    amount: string,
    message: string,
  ): Promise<ChatMsg> {
    this.lastMessageTime.set(userId, Date.now());

    const amountBig = BigInt(amount);
    if (amountBig < BigInt(CHAT_PRICES.coinDropMin)) {
      throw new Error('MIN_AMOUNT');
    }

    // Deduct COIN from sender
    const deducted = await vaultService.deductCoin(userId, amount);
    if (!deducted) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // Create chat message with coin_drop style
    const rows = await this.db.execute(sql`
      INSERT INTO global_chat_messages (user_id, message, style, effect)
      VALUES (${userId}, ${message}, 'coin_drop', 'coins')
      RETURNING id::text, created_at
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const row = rawRows[0]!;
    const messageId = String(row.id);

    // Create coin drop record
    const dropRows = await this.db.execute(sql`
      INSERT INTO chat_coin_drops (message_id, sender_id, amount)
      VALUES (${messageId}::uuid, ${userId}, ${amount})
      RETURNING id::text
    `);
    const rawDropRows = (Array.isArray(dropRows) ? dropRows : (dropRows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const dropId = String(rawDropRows[0]!.id);

    const user = await this.getUserInfo(userId);

    return {
      id: messageId,
      userId,
      address: String(user.address),
      nickname: user.nickname ? String(user.nickname) : null,
      vipTier: user.vip_tier ? String(user.vip_tier) : null,
      message,
      style: 'coin_drop',
      effect: 'coins',
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      coinDrop: {
        dropId,
        amount,
        claimedBy: null,
        claimedByNickname: null,
      },
    };
  }

  /** Claim a coin drop — atomic first-come-first-served */
  async claimCoinDrop(
    messageId: string,
    claimerUserId: string,
  ): Promise<{ success: boolean; drop?: { dropId: string; amount: string; claimedByAddress: string; claimedByNickname: string | null } }> {
    // Atomic claim: only succeeds if unclaimed
    const rows = await this.db.execute(sql`
      UPDATE chat_coin_drops
      SET claimed_by = ${claimerUserId}, claimed_at = NOW()
      WHERE message_id = ${messageId}::uuid
        AND claimed_by IS NULL
        AND sender_id != ${claimerUserId}
      RETURNING id::text, amount::text, sender_id::text
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length === 0) {
      // Either already claimed, doesn't exist, or sender trying to claim own drop
      return { success: false };
    }

    const drop = rawRows[0]!;
    const amount = String(drop.amount);

    // Credit COIN to claimer
    await vaultService.creditCoin(claimerUserId, amount);

    // Get claimer info
    const claimer = await this.getUserInfo(claimerUserId);

    logger.info(
      { messageId, claimerUserId, amount },
      'Coin drop claimed',
    );

    return {
      success: true,
      drop: {
        dropId: String(drop.id),
        amount,
        claimedByAddress: String(claimer.address),
        claimedByNickname: claimer.nickname ? String(claimer.nickname) : null,
      },
    };
  }

  /** Get today's messages (since midnight UTC) */
  async getTodayMessages(): Promise<ChatMsg[]> {
    const rows = await this.db.execute(sql`
      SELECT m.id::text, m.user_id::text as user_id, m.message, m.style, m.effect, m.created_at,
        u.address, u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
        cd.id::text as drop_id, cd.amount::text as drop_amount,
        cd.claimed_by::text as drop_claimed_by,
        cu.profile_nickname as drop_claimed_by_nickname
      FROM global_chat_messages m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN chat_coin_drops cd ON cd.message_id = m.id
      LEFT JOIN users cu ON cu.id = cd.claimed_by
      WHERE m.created_at >= (NOW() AT TIME ZONE 'UTC')::date::timestamptz
      ORDER BY m.created_at ASC
      LIMIT 200
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    return rawRows.map((r) => {
      const msg: ChatMsg = {
        id: String(r.id),
        userId: String(r.user_id),
        address: String(r.address),
        nickname: r.nickname ? String(r.nickname) : null,
        vipTier: r.vip_tier ? String(r.vip_tier) : null,
        message: String(r.message),
        style: r.style ? String(r.style) : null,
        effect: r.effect ? String(r.effect) : null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      };
      if (r.drop_id) {
        msg.coinDrop = {
          dropId: String(r.drop_id),
          amount: String(r.drop_amount),
          claimedBy: r.drop_claimed_by ? String(r.drop_claimed_by) : null,
          claimedByNickname: r.drop_claimed_by_nickname ? String(r.drop_claimed_by_nickname) : null,
        };
      }
      return msg;
    });
  }
}

export const chatService = new ChatService();
