import { eq, desc } from 'drizzle-orm';
import { txEvents, treasuryLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';

export class EventService {
  private db = getDb();

  async recordTxEvent(params: {
    txhash: string;
    height: bigint;
    eventType: string;
    attributes: Record<string, unknown>;
  }) {
    const [event] = await this.db
      .insert(txEvents)
      .values({
        txhash: params.txhash,
        height: params.height,
        eventType: params.eventType,
        attributes: params.attributes,
      })
      .returning();

    return event!;
  }

  async recordCommission(params: {
    txhash: string;
    amount: string;
    source: string;
  }) {
    const [entry] = await this.db
      .insert(treasuryLedger)
      .values({
        txhash: params.txhash,
        amount: params.amount,
        denom: 'LAUNCH',
        source: params.source,
      })
      .returning();

    return entry!;
  }

  async getRecentEvents(limit = 50) {
    return this.db
      .select()
      .from(txEvents)
      .orderBy(desc(txEvents.createdAt))
      .limit(limit);
  }
}

export const eventService = new EventService();
