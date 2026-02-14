import { eq } from 'drizzle-orm';
import { users, sessions, vaultBalances } from '@coinflip/db/schema';
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
}

export const userService = new UserService();
