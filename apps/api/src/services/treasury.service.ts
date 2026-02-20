import { desc, sql, count } from 'drizzle-orm';
import { treasuryLedger, bets, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { relayerService } from './relayer.js';
import { Errors } from '../lib/errors.js';

export class TreasuryService {
  private db = getDb();

  /**
   * Get treasury balance from chain:
   *  - vaultBalance: LAUNCH tokens deposited in the contract vault (commissions)
   *  - walletBalance: CW20 LAUNCH tokens in the treasury wallet (already withdrawn)
   */
  async getBalance(): Promise<{
    vaultAvailable: string;
    vaultLocked: string;
    walletBalance: string;
  }> {
    const treasuryAddr = env.TREASURY_ADDRESS;

    // 1) Query contract vault balance for the treasury address
    let vaultAvailable = '0';
    let vaultLocked = '0';
    try {
      const query = btoa(JSON.stringify({ vault_balance: { address: treasuryAddr } }));
      const res = await fetch(
        `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { data: { available: string; locked: string } };
        vaultAvailable = data.data.available;
        vaultLocked = data.data.locked;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query treasury vault balance');
    }

    // 2) Query CW20 wallet balance (tokens already withdrawn to wallet)
    let walletBalance = '0';
    try {
      const query = btoa(JSON.stringify({ balance: { address: treasuryAddr } }));
      const res = await fetch(
        `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.LAUNCH_CW20_ADDR}/smart/${query}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { data: { balance: string } };
        walletBalance = data.data.balance;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query treasury CW20 wallet balance');
    }

    return { vaultAvailable, vaultLocked, walletBalance };
  }

  /**
   * Paginated commission history from treasury_ledger.
   */
  async getLedger(limit = 20, offset = 0) {
    const rows = await this.db
      .select()
      .from(treasuryLedger)
      .orderBy(desc(treasuryLedger.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ total: count() })
      .from(treasuryLedger);
    const total = countResult[0]?.total ?? 0;

    return { rows, total };
  }

  /**
   * Aggregate commission stats.
   */
  async getLedgerStats() {
    const [stats] = await this.db
      .select({
        totalAmount: sql<string>`coalesce(sum(${treasuryLedger.amount}::numeric), 0)::text`,
        entryCount: count(),
        last24hAmount: sql<string>`coalesce(sum(case when ${treasuryLedger.createdAt} > now() - interval '24 hours' then ${treasuryLedger.amount}::numeric else 0 end), 0)::text`,
        last7dAmount: sql<string>`coalesce(sum(case when ${treasuryLedger.createdAt} > now() - interval '7 days' then ${treasuryLedger.amount}::numeric else 0 end), 0)::text`,
      })
      .from(treasuryLedger);

    return stats!;
  }

  /**
   * Platform-wide statistics: total bets, volume, users, active bets.
   */
  async getPlatformStats() {
    const [betStats] = await this.db
      .select({
        totalBets: count(),
        totalVolume: sql<string>`coalesce(sum(${bets.amount}::numeric), 0)::text`,
        resolvedBets: sql<number>`count(*) filter (where ${bets.status} in ('revealed', 'timeout_claimed'))`,
        activeBets: sql<number>`count(*) filter (where ${bets.status} in ('open', 'accepted'))`,
        canceledBets: sql<number>`count(*) filter (where ${bets.status} = 'canceled')`,
      })
      .from(bets);

    const [userStats] = await this.db
      .select({ totalUsers: count() })
      .from(users);

    return {
      totalBets: betStats!.totalBets,
      totalVolume: betStats!.totalVolume,
      resolvedBets: betStats!.resolvedBets,
      activeBets: betStats!.activeBets,
      canceledBets: betStats!.canceledBets,
      totalUsers: userStats!.totalUsers,
    };
  }

  /**
   * Withdraw LAUNCH tokens from the contract vault to the treasury wallet.
   * Since RELAYER_ADDRESS == TREASURY_ADDRESS, the relayer wallet signs directly.
   */
  async withdrawFromVault(amount: string): Promise<{ txHash: string; amount: string }> {
    // Verify there's enough in the treasury vault
    const balance = await this.getBalance();
    if (BigInt(balance.vaultAvailable) < BigInt(amount)) {
      throw Errors.insufficientBalance(amount, balance.vaultAvailable);
    }

    if (!relayerService.isReady()) {
      throw Errors.relayerNotReady();
    }

    // Use the relayer to withdraw (relayer IS treasury)
    const result = await relayerService.relayWithdraw(env.TREASURY_ADDRESS, amount);

    if (!result.success) {
      logger.error({ result, amount }, 'Treasury withdraw failed');
      if (result.timeout) {
        throw Errors.chainTimeout(result.txHash);
      }
      throw Errors.chainTxFailed(result.txHash ?? '', result.rawLog ?? result.error);
    }

    logger.info(
      { txHash: result.txHash, amount },
      'Treasury withdrawal confirmed',
    );

    return { txHash: result.txHash!, amount };
  }

  /**
   * Send LAUNCH tokens from treasury wallet to a recipient address.
   * Uses CW20 transfer. If the treasury wallet doesn't have enough,
   * automatically withdraws from the vault first.
   *
   * Flow:
   *  1. Check treasury CW20 wallet balance
   *  2. If insufficient, withdraw the deficit from vault to wallet
   *  3. Execute CW20 transfer from treasury to recipient
   */
  async sendPrize(
    recipientAddress: string,
    amount: string,
  ): Promise<{ txHash: string; amount: string; withdrawTxHash?: string }> {
    if (!relayerService.isReady()) {
      throw Errors.relayerNotReady();
    }

    const amountBig = BigInt(amount);
    let withdrawTxHash: string | undefined;

    // Step 1: Check wallet balance, auto-withdraw from vault if needed
    const balance = await this.getBalance();
    const walletBig = BigInt(balance.walletBalance);

    if (walletBig < amountBig) {
      const deficit = amountBig - walletBig;
      // Need to withdraw at least the deficit from vault
      const vaultBig = BigInt(balance.vaultAvailable);
      if (vaultBig + walletBig < amountBig) {
        throw Errors.insufficientBalance(
          amount,
          (vaultBig + walletBig).toString(),
        );
      }

      logger.info(
        { deficit: deficit.toString(), vaultAvailable: balance.vaultAvailable },
        'Treasury wallet insufficient for prize, withdrawing from vault',
      );

      const withdrawResult = await this.withdrawFromVault(deficit.toString());
      withdrawTxHash = withdrawResult.txHash;
    }

    // Step 2: CW20 transfer from treasury to recipient
    // Treasury IS relayer, so relayCw20Transfer(treasury, cw20, recipient, amount)
    // uses MsgExec where grantee == sender, which works as a direct execution.
    const result = await relayerService.relayCw20Transfer(
      env.TREASURY_ADDRESS,
      env.LAUNCH_CW20_ADDR,
      recipientAddress,
      amount,
      'CoinFlip event prize',
    );

    if (!result.success) {
      logger.error({ result, recipientAddress, amount }, 'Prize CW20 transfer failed');
      if (result.timeout) {
        throw Errors.chainTimeout(result.txHash);
      }
      throw Errors.chainTxFailed(
        result.txHash ?? '',
        result.rawLog ?? result.error,
      );
    }

    logger.info(
      { txHash: result.txHash, recipientAddress, amount, withdrawTxHash },
      'Prize sent to recipient wallet',
    );

    return { txHash: result.txHash!, amount, withdrawTxHash };
  }
}

export const treasuryService = new TreasuryService();
