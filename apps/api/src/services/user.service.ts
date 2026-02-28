import { eq, sql, desc, and } from 'drizzle-orm';
import { users, sessions, vaultBalances, bets, profileReactions } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const ALLOWED_EMOJIS = ['👍', '🔥', '💎', '🎯', '👑', '💪', '🤝', '⚡'];

export class UserService {
  private db = getDb();

  async findOrCreateUser(address: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.address, address),
    });

    if (existing) return existing;

    const [user] = await this.db
      .insert(users)
      .values({ address })
      .returning();

    // Create initial vault balance
    await this.db.insert(vaultBalances).values({
      userId: user!.id,
      available: '0',
      locked: '0',
    });

    logger.info({ address }, 'New user created');
    return user!;
  }

  async getUserByAddress(address: string) {
    return this.db.query.users.findFirst({
      where: eq(users.address, address),
    });
  }

  /** Get active VIP tier for a user (null if no active subscription) */
  async getVipTier(userId: string): Promise<string | null> {
    const rows = await this.db.execute(sql`
      SELECT tier FROM vip_subscriptions
      WHERE user_id = ${userId} AND expires_at > NOW() AND canceled_at IS NULL
      ORDER BY expires_at DESC LIMIT 1
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{ tier: string }>;
    return rawRows[0]?.tier ?? null;
  }

  /**
   * Find user by Telegram ID. Returns the most recently linked wallet user.
   * If multiple wallets have the same TG, returns the one with a real address first,
   * then by most recent telegram_linked_at.
   */
  async getUserByTelegramId(telegramId: number) {
    const rows = await this.db.execute(
      sql`select * from users where telegram_id = ${telegramId}
          order by
            case when address not like 'tg_%' then 0 else 1 end,
            telegram_linked_at desc nulls last
          limit 1`
    );
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    if (!rawRows.length) return null;
    const r = rawRows[0]!;
    return {
      id: String(r.id),
      address: r.address ? String(r.address) : null,
      profileNickname: r.profile_nickname ? String(r.profile_nickname) : null,
      avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      telegramId: r.telegram_id ? Number(r.telegram_id) : null,
      telegramUsername: r.telegram_username ? String(r.telegram_username) : null,
      telegramFirstName: r.telegram_first_name ? String(r.telegram_first_name) : null,
      telegramPhotoUrl: r.telegram_photo_url ? String(r.telegram_photo_url) : null,
    };
  }

  /**
   * Find or create user by Telegram ID (for Mini App auth).
   * Creates a user without wallet address — address gets linked later when wallet connects.
   */
  async findOrCreateByTelegram(telegramId: number, data: {
    username: string | null;
    firstName: string;
    photoUrl: string | null;
  }) {
    // Check if telegram user exists
    const existing = await this.getUserByTelegramId(telegramId);
    if (existing) {
      // Update TG data if changed
      await this.db.execute(
        sql`update users set
          telegram_username = ${data.username},
          telegram_first_name = ${data.firstName},
          telegram_photo_url = ${data.photoUrl}
        where telegram_id = ${telegramId}`
      );
      return existing;
    }

    // Create new user (no address yet — will be linked when wallet connects)
    const placeholderAddress = `tg_${telegramId}`;
    const [user] = await this.db
      .insert(users)
      .values({
        address: placeholderAddress,
        telegramId,
        telegramUsername: data.username,
        telegramFirstName: data.firstName,
        telegramPhotoUrl: data.photoUrl,
        telegramLinkedAt: new Date(),
        profileNickname: data.firstName,
      })
      .returning();

    // Create vault balance
    await this.db.insert(vaultBalances).values({
      userId: user!.id,
      available: '0',
      locked: '0',
    });

    logger.info({ telegramId, username: data.username }, 'New Telegram user created');
    return {
      id: user!.id,
      address: user!.address,
      profileNickname: user!.profileNickname,
      avatarUrl: user!.avatarUrl,
      telegramId: user!.telegramId,
      telegramUsername: user!.telegramUsername,
      telegramFirstName: user!.telegramFirstName,
      telegramPhotoUrl: user!.telegramPhotoUrl,
    };
  }

  /**
   * Link a wallet address to an existing Telegram-only user.
   * Used when a Telegram Mini App user connects their wallet for the first time.
   */
  async linkWalletToTelegramUser(userId: string, address: string) {
    // Check if this address is already used by another user
    const existingByAddress = await this.getUserByAddress(address);
    if (existingByAddress && existingByAddress.id !== userId) {
      // Merge: transfer telegram data to the existing wallet user
      const tgUser = await this.getUserById(userId);
      if (tgUser) {
        await this.db
          .update(users)
          .set({
            telegramId: tgUser.telegramId,
            telegramUsername: tgUser.telegramUsername,
            telegramFirstName: tgUser.telegramFirstName,
            telegramPhotoUrl: tgUser.telegramPhotoUrl,
            telegramLinkedAt: new Date(),
          })
          .where(eq(users.id, existingByAddress.id));

        // Delete the placeholder telegram-only user
        // (vault balance, etc. belong to the wallet user)
        await this.db.execute(sql`delete from vault_balances where user_id = ${userId}`);
        await this.db.execute(sql`delete from users where id = ${userId}`);

        return existingByAddress;
      }
    }

    // Update the user's address (was tg_xxx placeholder)
    const [updated] = await this.db
      .update(users)
      .set({ address })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getUserById(userId: string) {
    return this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
  }

  async updateNickname(userId: string, nickname: string) {
    const sanitized = nickname.trim().replace(/\s+/g, ' ');
    const [updated] = await this.db
      .update(users)
      .set({ profileNickname: sanitized })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async createSession(userId: string, options: {
    authzEnabled: boolean;
    feeSponsored: boolean;
    authzExpirationTime?: Date;
    expiresAt: Date;
  }) {
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        authzEnabled: options.authzEnabled,
        feeSponsored: options.feeSponsored,
        authzExpirationTime: options.authzExpirationTime,
        expiresAt: options.expiresAt,
      })
      .returning();

    return session!;
  }

  async getActiveSession(userId: string) {
    return this.db.query.sessions.findFirst({
      where: eq(sessions.userId, userId),
      orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
    });
  }

  async updateSession(sessionId: string, updates: {
    authzEnabled?: boolean;
    feeSponsored?: boolean;
    authzExpirationTime?: Date;
  }) {
    const [session] = await this.db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, sessionId))
      .returning();
    return session;
  }

  /**
   * Compute real stats for a user from the bets table.
   * A user participates as maker or acceptor; wins are determined by winnerUserId.
   */
  async getUserStats(userId: string) {
    const resolvedStatuses = ['revealed', 'timeout_claimed'];

    const [stats] = await this.db
      .select({
        totalBets: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${bets.winnerUserId} = ${userId})::int`,
        losses: sql<number>`count(*) filter (where ${bets.winnerUserId} is not null and ${bets.winnerUserId} != ${userId})::int`,
        totalWagered: sql<string>`coalesce(sum(${bets.amount}::numeric), 0)::text`,
        totalWon: sql<string>`coalesce(sum(case when ${bets.winnerUserId} = ${userId} then ${bets.payoutAmount}::numeric else 0 end), 0)::text`,
      })
      .from(bets)
      .where(
        sql`(${bets.makerUserId} = ${userId} or ${bets.acceptorUserId} = ${userId})
            and ${bets.status} in ('revealed', 'timeout_claimed')`,
      );

    return {
      total_bets: stats?.totalBets ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      total_wagered: stats?.totalWagered ?? '0',
      total_won: stats?.totalWon ?? '0',
    };
  }

  /**
   * Leaderboard: top players ranked by win count.
   * Only counts resolved bets (revealed / timeout_claimed).
   */
  async getLeaderboard(limit = 20, sortBy: 'wins' | 'wagered' | 'win_rate' = 'wins') {
    // Build a union of maker + acceptor participations, then aggregate
    const rows = await this.db.execute(sql`
      with participants as (
        select
          b.maker_user_id as user_id,
          b.amount::numeric as amount,
          b.payout_amount::numeric as payout,
          case when b.winner_user_id = b.maker_user_id then 1 else 0 end as is_win
        from bets b
        where b.status in ('revealed', 'timeout_claimed')
        union all
        select
          b.acceptor_user_id as user_id,
          b.amount::numeric as amount,
          b.payout_amount::numeric as payout,
          case when b.winner_user_id = b.acceptor_user_id then 1 else 0 end as is_win
        from bets b
        where b.status in ('revealed', 'timeout_claimed')
          and b.acceptor_user_id is not null
      )
      select
        u.address,
        u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
        count(*)::int as total_bets,
        sum(p.is_win)::int as wins,
        sum(p.amount)::text as total_wagered,
        case when count(*) > 0 then round(sum(p.is_win)::numeric / count(*)::numeric, 4) else 0 end as win_rate
      from participants p
      join users u on u.id = p.user_id
      group by u.id, u.address, u.profile_nickname
      having count(*) >= 1
      order by ${
        sortBy === 'wagered'
          ? sql`sum(p.amount)::numeric desc`
          : sortBy === 'win_rate'
            ? sql`win_rate desc, sum(p.is_win) desc`
            : sql`sum(p.is_win) desc, win_rate desc`
      }
      limit ${limit}
    `);

    // Drizzle execute() returns different shapes depending on driver — handle both
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
      address: string;
      nickname: string | null;
      vip_tier: string | null;
      total_bets: number;
      wins: number;
      total_wagered: string;
      win_rate: string;
    }>;

    return rawRows.map((row, i) => ({
      rank: i + 1,
      address: row.address,
      nickname: row.nickname,
      vip_tier: row.vip_tier ?? null,
      total_bets: Number(row.total_bets),
      wins: Number(row.wins),
      total_wagered: row.total_wagered ?? '0',
      win_rate: parseFloat(String(row.win_rate)) || 0,
    }));
  }
  /**
   * Get recent resolved bets for a player (public profile) with pagination.
   */
  async getPlayerRecentBets(userId: string, limit = 10, offset = 0) {
    const [countResult, rows] = await Promise.all([
      this.db.execute(sql`
        select count(*)::int as total
        from bets b
        where (b.maker_user_id = ${userId} or b.acceptor_user_id = ${userId})
          and b.status in ('revealed', 'timeout_claimed')
      `),
      this.db.execute(sql`
        select
          b.bet_id::text as id,
          b.amount::text as amount,
          b.payout_amount::text as payout_amount,
          b.status,
          b.resolved_time,
          b.created_time,
          b.winner_user_id::text as winner_user_id,
          b.maker_user_id::text as maker_user_id,
          b.acceptor_user_id::text as acceptor_user_id,
          maker.address as maker,
          maker.profile_nickname as maker_nickname,
          (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.maker_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS maker_vip_tier,
          acceptor.address as acceptor,
          acceptor.profile_nickname as acceptor_nickname,
          (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = b.acceptor_user_id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS acceptor_vip_tier
        from bets b
        join users maker on maker.id = b.maker_user_id
        left join users acceptor on acceptor.id = b.acceptor_user_id
        where (b.maker_user_id = ${userId} or b.acceptor_user_id = ${userId})
          and b.status in ('revealed', 'timeout_claimed')
        order by b.resolved_time desc nulls last
        limit ${limit} offset ${offset}
      `),
    ]);

    const countRows = (Array.isArray(countResult) ? countResult : (countResult as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.total ?? 0);

    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const bets = rawRows.map((r) => ({
      id: String(r.id),
      amount: String(r.amount ?? '0'),
      payout_amount: String(r.payout_amount ?? '0'),
      status: String(r.status),
      resolved_at: r.resolved_time ? String(r.resolved_time) : null,
      created_at: r.created_time ? String(r.created_time) : null,
      winner_user_id: r.winner_user_id ? String(r.winner_user_id) : null,
      maker_user_id: String(r.maker_user_id),
      maker: String(r.maker),
      maker_nickname: r.maker_nickname ? String(r.maker_nickname) : null,
      maker_vip_tier: r.maker_vip_tier ? String(r.maker_vip_tier) : null,
      acceptor: r.acceptor ? String(r.acceptor) : null,
      acceptor_nickname: r.acceptor_nickname ? String(r.acceptor_nickname) : null,
      acceptor_vip_tier: r.acceptor_vip_tier ? String(r.acceptor_vip_tier) : null,
      is_win: r.winner_user_id === userId,
    }));

    return { bets, total };
  }

  /**
   * Head-to-head stats between two users.
   */
  async getHeadToHead(userId: string, opponentUserId: string) {
    const [stats] = await this.db
      .select({
        totalGames: sql<number>`count(*)::int`,
        userWins: sql<number>`count(*) filter (where ${bets.winnerUserId} = ${userId})::int`,
        opponentWins: sql<number>`count(*) filter (where ${bets.winnerUserId} = ${opponentUserId})::int`,
      })
      .from(bets)
      .where(
        sql`(
          (${bets.makerUserId} = ${userId} and ${bets.acceptorUserId} = ${opponentUserId})
          or
          (${bets.makerUserId} = ${opponentUserId} and ${bets.acceptorUserId} = ${userId})
        )
        and ${bets.status} in ('revealed', 'timeout_claimed')`,
      );

    return {
      total_games: stats?.totalGames ?? 0,
      your_wins: stats?.userWins ?? 0,
      their_wins: stats?.opponentWins ?? 0,
    };
  }

  /**
   * Get the single biggest win ever (highest payout_amount from one bet).
   * Returns null if no resolved bets exist.
   */
  async getTopWinner(): Promise<{
    address: string;
    nickname: string | null;
    vip_tier: string | null;
    amount: string;
    payout: string;
    resolved_at: string | null;
  } | null> {
    const rows = await this.db.execute(sql`
      select
        u.address,
        u.profile_nickname as nickname,
        (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
        b.amount::text as amount,
        b.payout_amount::text as payout,
        b.resolved_time as resolved_at
      from bets b
      join users u on u.id = b.winner_user_id
      where b.status in ('revealed', 'timeout_claimed')
        and b.winner_user_id is not null
        and b.payout_amount is not null
      order by b.payout_amount::numeric desc
      limit 1
    `);

    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
      address: string;
      nickname: string | null;
      vip_tier: string | null;
      amount: string;
      payout: string;
      resolved_at: string | null;
    }>;

    if (!rawRows.length) return null;
    const row = rawRows[0]!;
    return {
      address: row.address,
      nickname: row.nickname,
      vip_tier: row.vip_tier ?? null,
      amount: row.amount,
      payout: row.payout,
      resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    };
  }
  /**
   * Get aggregated reaction counts for a user's profile.
   */
  async getProfileReactions(userId: string) {
    const rows = await this.db.execute(sql`
      select emoji, count(*)::int as count
      from profile_reactions
      where to_user_id = ${userId}
      group by emoji
      order by count desc
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
      emoji: string;
      count: number;
    }>;
    return rawRows.map((r) => ({ emoji: r.emoji, count: Number(r.count) }));
  }

  /**
   * Get the current user's reaction on a specific profile (or null).
   */
  async getMyReaction(fromUserId: string, toUserId: string) {
    const row = await this.db.query.profileReactions.findFirst({
      where: and(
        eq(profileReactions.fromUserId, fromUserId),
        eq(profileReactions.toUserId, toUserId),
      ),
    });
    return row?.emoji ?? null;
  }

  /**
   * Set or update a reaction on a profile. Returns the upserted emoji.
   */
  async setProfileReaction(fromUserId: string, toUserId: string, emoji: string) {
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      throw new Error('Invalid emoji');
    }
    if (fromUserId === toUserId) {
      throw new Error('Cannot react to own profile');
    }

    await this.db
      .insert(profileReactions)
      .values({ fromUserId, toUserId, emoji })
      .onConflictDoUpdate({
        target: [profileReactions.fromUserId, profileReactions.toUserId],
        set: { emoji, createdAt: new Date() },
      });

    return emoji;
  }

  /**
   * Remove a reaction from a profile.
   */
  async removeProfileReaction(fromUserId: string, toUserId: string) {
    await this.db
      .delete(profileReactions)
      .where(
        and(
          eq(profileReactions.fromUserId, fromUserId),
          eq(profileReactions.toUserId, toUserId),
        ),
      );
  }

  /**
   * Link a Telegram account to a user (wallet).
   * One TG account can be linked to multiple wallets (multi-wallet users).
   * Each wallet independently tracks its Telegram link.
   */
  async linkTelegram(userId: string, data: {
    telegramId: number;
    username: string | null;
    firstName: string;
    photoUrl: string | null;
  }) {
    // Unlink this Telegram from any other user first (unique constraint on telegram_id)
    await this.db
      .update(users)
      .set({
        telegramId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramPhotoUrl: null,
        telegramLinkedAt: null,
      })
      .where(eq(users.telegramId, data.telegramId));

    const [updated] = await this.db
      .update(users)
      .set({
        telegramId: data.telegramId,
        telegramUsername: data.username,
        telegramFirstName: data.firstName,
        telegramPhotoUrl: data.photoUrl,
        telegramLinkedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  /**
   * Unlink Telegram account from a user.
   */
  async unlinkTelegram(userId: string) {
    const [updated] = await this.db
      .update(users)
      .set({
        telegramId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramPhotoUrl: null,
        telegramLinkedAt: null,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  /**
   * Compute achievements for a user from existing bet data.
   * Returns earned achievement IDs + extra stats needed for progress tracking.
   */
  async getUserAchievements(userId: string) {
    // Single query: stats + max bet + best win streak
    const rows = await this.db.execute(sql`
      with user_bets as (
        select
          b.bet_id,
          b.amount::numeric as amount,
          b.payout_amount::numeric as payout,
          b.winner_user_id,
          b.resolved_time,
          case when b.winner_user_id = ${userId} then true else false end as is_win
        from bets b
        where (b.maker_user_id = ${userId} or b.acceptor_user_id = ${userId})
          and b.status in ('revealed', 'timeout_claimed')
        order by b.resolved_time asc
      ),
      streaks as (
        select
          is_win,
          bet_id,
          row_number() over (order by resolved_time asc) -
          row_number() over (partition by is_win order by resolved_time asc) as grp
        from user_bets
      ),
      streak_lengths as (
        select max(cnt) as max_win_streak
        from (
          select count(*) as cnt
          from streaks
          where is_win = true
          group by grp
        ) sub
      )
      select
        count(*)::int as total_bets,
        count(*) filter (where is_win)::int as wins,
        coalesce(sum(amount), 0)::text as total_wagered,
        coalesce(sum(case when is_win then payout else 0 end), 0)::text as total_won,
        coalesce(max(amount), 0)::text as max_bet,
        coalesce(max(case when is_win then payout else null end), 0)::text as max_win_payout,
        coalesce((select max_win_streak from streak_lengths), 0)::int as max_win_streak
      from user_bets
    `);

    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    const r = rawRows[0];

    const totalBets = Number(r?.total_bets ?? 0);
    const wins = Number(r?.wins ?? 0);
    const totalWagered = Number(r?.total_wagered ?? 0);
    const totalWon = Number(r?.total_won ?? 0);
    const maxBet = Number(r?.max_bet ?? 0);
    const maxWinPayout = Number(r?.max_win_payout ?? 0);
    const maxWinStreak = Number(r?.max_win_streak ?? 0);

    // 1 LAUNCH = 1_000_000 micro
    const MICRO = 1_000_000;

    const earned: string[] = [];

    // Win milestones
    if (wins >= 100) earned.push('first_win');
    if (wins >= 1_000) earned.push('wins_10');
    if (wins >= 5_000) earned.push('wins_50');
    if (wins >= 10_000) earned.push('wins_100');

    // Games milestones
    if (totalBets >= 10_000) earned.push('veteran');
    if (totalBets >= 50_000) earned.push('legend');

    // Bet size
    if (maxBet >= 10_000 * MICRO) earned.push('high_roller');
    if (maxBet >= 50_000 * MICRO) earned.push('whale');

    // Volume
    if (totalWagered >= 100_000 * MICRO) earned.push('volume_1k');
    if (totalWagered >= 1_000_000 * MICRO) earned.push('volume_10k');
    if (totalWagered >= 10_000_000 * MICRO) earned.push('volume_100k');

    // Profitability
    if (totalWon > totalWagered && totalBets >= 500) earned.push('profitable');

    // Win streaks
    if (maxWinStreak >= 300) earned.push('streak_3');
    if (maxWinStreak >= 500) earned.push('streak_5');
    if (maxWinStreak >= 1_000) earned.push('streak_10');

    return {
      earned,
      progress: {
        total_bets: totalBets,
        wins,
        total_wagered: String(totalWagered),
        total_won: String(totalWon),
        max_bet: String(maxBet),
        max_win_payout: String(maxWinPayout),
        max_win_streak: maxWinStreak,
      },
    };
  }
}

export const userService = new UserService();
