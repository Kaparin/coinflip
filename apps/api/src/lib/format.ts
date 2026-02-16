import type { BetRow } from '../services/bet.service.js';
import { REVEAL_TIMEOUT_SECS, OPEN_BET_TTL_SECS } from '@coinflip/shared/constants';

type UserInfo = { address: string; nickname: string | null };

/** Format a DB bet row into the API response shape */
export function formatBetResponse(bet: BetRow, addressMap?: Map<string, UserInfo>) {
  const revealDeadline = bet.acceptedTime
    ? new Date(bet.acceptedTime.getTime() + REVEAL_TIMEOUT_SECS * 1000).toISOString()
    : null;

  // Open bets expire after OPEN_BET_TTL_SECS (12 hours)
  const expiresAt = (bet.status === 'open' || bet.status === 'canceling')
    ? new Date(bet.createdTime.getTime() + OPEN_BET_TTL_SECS * 1000).toISOString()
    : null;

  const makerInfo = addressMap?.get(bet.makerUserId);
  const acceptorInfo = bet.acceptorUserId ? addressMap?.get(bet.acceptorUserId) : null;
  const winnerInfo = bet.winnerUserId ? addressMap?.get(bet.winnerUserId) : null;

  return {
    id: Number(bet.betId),
    maker: makerInfo?.address ?? bet.makerUserId,
    maker_nickname: makerInfo?.nickname ?? null,
    amount: bet.amount,
    status: bet.status,
    created_at: bet.createdTime.toISOString(),
    txhash_create: bet.txhashCreate,

    acceptor: acceptorInfo?.address ?? (bet.acceptorUserId ? bet.acceptorUserId : null),
    acceptor_nickname: acceptorInfo?.nickname ?? null,
    acceptor_guess: bet.acceptorGuess,
    accepted_at: bet.acceptedTime?.toISOString() ?? null,
    txhash_accept: bet.txhashAccept,

    reveal_side: null,
    winner: winnerInfo?.address ?? (bet.winnerUserId ? bet.winnerUserId : null),
    winner_nickname: winnerInfo?.nickname ?? null,
    payout_amount: bet.payoutAmount,
    commission_amount: bet.commissionAmount,
    resolved_at: bet.resolvedTime?.toISOString() ?? null,
    txhash_resolve: bet.txhashResolve,

    reveal_deadline: revealDeadline,
    expires_at: expiresAt,
  };
}

/** Truncate address for display */
export function shortAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
