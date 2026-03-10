import { desc, sql, count } from 'drizzle-orm';
import { treasuryLedger, bets, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { env, getActiveContractAddr, isAxmMode } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { chainRest } from '../lib/chain-fetch.js';
import { relayerService } from './relayer.js';
import { Errors } from '../lib/errors.js';

export class TreasuryService {
  private db = getDb();

  /**
   * Get treasury balance from chain:
   *  - vaultBalance: tokens deposited in the contract vault (commissions)
   *  - walletBalance: tokens in the treasury wallet (already withdrawn)
   */
  async getBalance(): Promise<{
    vaultAvailable: string;
    vaultLocked: string;
    walletBalance: string;
  }> {
    const treasuryAddr = env.TREASURY_ADDRESS;
    const contractAddr = getActiveContractAddr();

    // 1) Query contract vault balance for the treasury address
    let vaultAvailable = '0';
    let vaultLocked = '0';
    try {
      const query = btoa(JSON.stringify({ vault_balance: { address: treasuryAddr } }));
      const res = await chainRest(
        `/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${query}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { data: { available: string; locked: string } };
        vaultAvailable = data.data.available;
        vaultLocked = data.data.locked;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query treasury vault balance');
    }

    // 2) Query wallet balance (CW20 or native depending on mode)
    let walletBalance = '0';
    try {
      if (isAxmMode()) {
        // AXM mode: query native bank balance
        const res = await chainRest(
          `/cosmos/bank/v1beta1/balances/${treasuryAddr}/by_denom?denom=${env.AXM_DENOM}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { balance: { amount: string } };
          walletBalance = data.balance.amount;
        }
      } else {
        // COIN mode: query CW20 balance
        const query = btoa(JSON.stringify({ balance: { address: treasuryAddr } }));
        const res = await chainRest(
          `/cosmwasm/wasm/v1/contract/${env.LAUNCH_CW20_ADDR}/smart/${query}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { data: { balance: string } };
          walletBalance = data.data.balance;
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query treasury wallet balance');
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
   * Withdraw tokens from the contract vault to the relayer/treasury wallet.
   * TREASURY_ADDRESS == RELAYER_ADDRESS, so we use direct MsgExecuteContract
   * (no authz wrapper needed — relayer signs as itself).
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

    // Direct contract call — relayer IS treasury, so sender == treasury in contract
    const result = await relayerService.relayContractExecute(
      getActiveContractAddr(),
      { withdraw: { amount } },
      [],
      'Treasury vault withdrawal',
    );

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
   * Send native AXM prize from treasury wallet to a recipient address.
   * Prizes are ALWAYS in native AXM regardless of GAME_CURRENCY mode.
   * Checks treasury wallet's native AXM balance before sending.
   */
  async sendPrize(
    recipientAddress: string,
    amount: string,
  ): Promise<{ txHash: string; amount: string }> {
    if (!relayerService.isReady()) {
      throw Errors.relayerNotReady();
    }

    // Check relayer native AXM balance (prizes are sent from relayer wallet)
    let walletBalance = '0';
    try {
      const res = await chainRest(
        `/cosmos/bank/v1beta1/balances/${env.RELAYER_ADDRESS}/by_denom?denom=${env.AXM_DENOM}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { balance: { amount: string } };
        walletBalance = data.balance.amount;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query relayer native AXM balance for prize');
    }

    if (BigInt(walletBalance) < BigInt(amount)) {
      throw Errors.insufficientBalance(amount, walletBalance);
    }

    // Send native AXM via MsgSend
    const result = await relayerService.relayNativeSend(
      recipientAddress,
      amount,
      env.AXM_DENOM,
      'CoinFlip event prize',
    );

    if (!result.success) {
      logger.error({ result, recipientAddress, amount }, 'Prize transfer failed');
      if (result.timeout) {
        throw Errors.chainTimeout(result.txHash);
      }
      throw Errors.chainTxFailed(
        result.txHash ?? '',
        result.rawLog ?? result.error,
      );
    }

    logger.info(
      { txHash: result.txHash, recipientAddress, amount },
      'AXM prize sent to recipient wallet',
    );

    return { txHash: result.txHash!, amount };
  }

  /**
   * Send CW20 COIN tokens from treasury wallet to a recipient.
   * Always uses CW20 transfer regardless of GAME_CURRENCY mode.
   * Used by Shop (which always deals in COIN tokens).
   */
  async sendCoin(
    recipientAddress: string,
    amount: string,
  ): Promise<{ txHash: string; amount: string }> {
    if (!relayerService.isReady()) {
      throw Errors.relayerNotReady();
    }
    if (!env.LAUNCH_CW20_ADDR) {
      throw new Error('LAUNCH_CW20_ADDR not configured — cannot send COIN tokens');
    }

    // Check treasury CW20 wallet balance
    let walletBalance = 0n;
    try {
      const query = btoa(JSON.stringify({ balance: { address: env.TREASURY_ADDRESS } }));
      const res = await chainRest(
        `/cosmwasm/wasm/v1/contract/${env.LAUNCH_CW20_ADDR}/smart/${query}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { data: { balance: string } };
        walletBalance = BigInt(data.data.balance);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query treasury CW20 balance for sendCoin');
    }

    if (walletBalance < BigInt(amount)) {
      throw Errors.insufficientBalance(
        amount,
        walletBalance.toString(),
      );
    }

    // CW20 transfer from treasury to recipient
    const result = await relayerService.relayCw20Transfer(
      env.TREASURY_ADDRESS,
      env.LAUNCH_CW20_ADDR,
      recipientAddress,
      amount,
      'COIN Shop purchase',
    );

    if (!result.success) {
      logger.error({ result, recipientAddress, amount }, 'COIN transfer failed');
      if (result.timeout) {
        throw Errors.chainTimeout(result.txHash);
      }
      throw Errors.chainTxFailed(
        result.txHash ?? '',
        result.rawLog ?? result.error,
      );
    }

    logger.info(
      { txHash: result.txHash, recipientAddress, amount },
      'COIN tokens sent to recipient',
    );

    return { txHash: result.txHash!, amount };
  }
}

export const treasuryService = new TreasuryService();
