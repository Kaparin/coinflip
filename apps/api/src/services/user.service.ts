import { eq, sql, desc } from 'drizzle-orm';
import { users, sessions, vaultBalances, bets } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

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
      total_bets: number;
      wins: number;
      total_wagered: string;
      win_rate: string;
    }>;

    return rawRows.map((row, i) => ({
      rank: i + 1,
      address: row.address,
      nickname: row.nickname,
      total_bets: Number(row.total_bets),
      wins: Number(row.wins),
      total_wagered: row.total_wagered ?? '0',
      win_rate: parseFloat(String(row.win_rate)) || 0,
    }));
  }
}

export const userService = new UserService();
