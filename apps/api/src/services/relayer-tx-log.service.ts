import { getDb } from '../lib/db.js';
import { relayerTransactions } from '@coinflip/db/schema';
import { eq, and, desc, sql, or, ilike, count as countFn } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

interface LogStartParams {
  userAddress: string;
  contractAddress?: string;
  action: string;
  actionPayload?: unknown;
  memo?: string;
  description?: string;
}

interface LogCompleteParams {
  txHash?: string;
  success: boolean;
  code?: number;
  rawLog?: string;
  height?: number;
  durationMs: number;
  attempt?: number;
}

interface QueryFilters {
  action?: string;
  userAddress?: string;
  success?: boolean | null;
  search?: string;
}

export function buildDescription(
  action: string,
  userAddress: string,
  contractAddress?: string,
  payload?: unknown,
): string {
  const shortAddr = userAddress.length > 15
    ? `${userAddress.slice(0, 10)}...${userAddress.slice(-4)}`
    : userAddress;

  const p = payload as Record<string, unknown> | undefined;

  switch (action) {
    case 'create_bet': {
      const amount = (p as { create_bet?: { amount?: string } })?.create_bet?.amount;
      return amount ? `Create bet ${amount} LAUNCH by ${shortAddr}` : `Create bet by ${shortAddr}`;
    }
    case 'accept_bet': {
      const betId = (p as { accept_bet?: { bet_id?: number } })?.accept_bet?.bet_id;
      return betId != null ? `Accept bet #${betId} by ${shortAddr}` : `Accept bet by ${shortAddr}`;
    }
    case 'accept_and_reveal': {
      const betId = (p as { accept_and_reveal?: { bet_id?: number } })?.accept_and_reveal?.bet_id;
      return betId != null ? `Accept & reveal bet #${betId} by ${shortAddr}` : `Accept & reveal by ${shortAddr}`;
    }
    case 'reveal': {
      const betId = (p as { reveal?: { bet_id?: number } })?.reveal?.bet_id;
      return betId != null ? `Reveal bet #${betId} by ${shortAddr}` : `Reveal by ${shortAddr}`;
    }
    case 'cancel_bet': {
      const betId = (p as { cancel_bet?: { bet_id?: number } })?.cancel_bet?.bet_id;
      return betId != null ? `Cancel bet #${betId} by ${shortAddr}` : `Cancel bet by ${shortAddr}`;
    }
    case 'claim_timeout': {
      const betId = (p as { claim_timeout?: { bet_id?: number } })?.claim_timeout?.bet_id;
      return betId != null ? `Claim timeout bet #${betId} by ${shortAddr}` : `Claim timeout by ${shortAddr}`;
    }
    case 'withdraw': {
      const amount = (p as { withdraw?: { amount?: string } })?.withdraw?.amount;
      return amount ? `Withdraw ${amount} LAUNCH for ${shortAddr}` : `Withdraw for ${shortAddr}`;
    }
    case 'deposit':
      return `Deposit by ${shortAddr}`;
    case 'cw20_transfer': {
      const transfer = (p as { transfer?: { recipient?: string; amount?: string } })?.transfer;
      if (transfer?.amount) {
        const shortRecipient = transfer.recipient && transfer.recipient.length > 15
          ? `${transfer.recipient.slice(0, 10)}...${transfer.recipient.slice(-4)}`
          : transfer.recipient;
        return `CW20 transfer ${transfer.amount} LAUNCH to ${shortRecipient}`;
      }
      return `CW20 transfer by ${shortAddr}`;
    }
    default:
      return `${action} by ${shortAddr}`;
  }
}

class RelayerTxLogService {
  async logStart(params: LogStartParams): Promise<string> {
    try {
      const db = getDb();
      const description = params.description ?? buildDescription(
        params.action,
        params.userAddress,
        params.contractAddress,
        params.actionPayload,
      );

      const [row] = await db
        .insert(relayerTransactions)
        .values({
          userAddress: params.userAddress,
          contractAddress: params.contractAddress,
          action: params.action,
          actionPayload: params.actionPayload,
          memo: params.memo,
          description,
        })
        .returning({ id: relayerTransactions.id });

      return row!.id;
    } catch (err) {
      logger.error({ err }, 'Failed to log relayer tx start');
      return '';
    }
  }

  async logComplete(id: string, result: LogCompleteParams): Promise<void> {
    if (!id) return;
    try {
      const db = getDb();
      await db
        .update(relayerTransactions)
        .set({
          txHash: result.txHash,
          success: result.success,
          code: result.code,
          rawLog: result.rawLog,
          height: result.height,
          durationMs: result.durationMs,
          attempt: result.attempt,
        })
        .where(eq(relayerTransactions.id, id));
    } catch (err) {
      logger.error({ err, id }, 'Failed to log relayer tx complete');
    }
  }

  async query(
    filters: QueryFilters,
    limit = 50,
    offset = 0,
  ): Promise<{ data: (typeof relayerTransactions.$inferSelect)[]; total: number }> {
    const db = getDb();
    const conditions = [];

    if (filters.action) {
      conditions.push(eq(relayerTransactions.action, filters.action));
    }
    if (filters.userAddress) {
      conditions.push(eq(relayerTransactions.userAddress, filters.userAddress));
    }
    if (filters.success !== undefined && filters.success !== null) {
      conditions.push(eq(relayerTransactions.success, filters.success));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(relayerTransactions.userAddress, `%${filters.search}%`),
          ilike(relayerTransactions.txHash, `%${filters.search}%`),
          ilike(relayerTransactions.description, `%${filters.search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [totalRow]] = await Promise.all([
      db
        .select()
        .from(relayerTransactions)
        .where(where)
        .orderBy(desc(relayerTransactions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: countFn() })
        .from(relayerTransactions)
        .where(where),
    ]);

    return { data, total: Number(totalRow?.count ?? 0) };
  }
}

export const relayerTxLogService = new RelayerTxLogService();
