import type { BetRow } from '../services/bet.service.js';
import { REVEAL_TIMEOUT_SECS } from '@coinflip/shared/constants';

/** Format a DB bet row into the API response shape */
export function formatBetResponse(bet: BetRow, addressMap?: Map<string, string>) {
  const revealDeadline = bet.acceptedTime
    ? new Date(bet.acceptedTime.getTime() + REVEAL_TIMEOUT_SECS * 1000).toISOString()
    : null;

  return {
    id: Number(bet.betId),
    maker: addressMap?.get(bet.makerUserId) ?? bet.makerUserId,
    amount: bet.amount,
    status: bet.status,
    created_at: bet.createdTime.toISOString(),
    txhash_create: bet.txhashCreate,

    acceptor: bet.acceptorUserId
      ? (addressMap?.get(bet.acceptorUserId) ?? bet.acceptorUserId)
      : null,
    acceptor_guess: bet.acceptorGuess,
    accepted_at: bet.acceptedTime?.toISOString() ?? null,
    txhash_accept: bet.txhashAccept,

    reveal_side: null, // Not stored in DB directly — derive from chain event if needed
    winner: bet.winnerUserId
      ? (addressMap?.get(bet.winnerUserId) ?? bet.winnerUserId)
      : null,
    payout_amount: bet.payoutAmount,
    commission_amount: bet.commissionAmount,
    resolved_at: bet.resolvedTime?.toISOString() ?? null,
    txhash_resolve: bet.txhashResolve,

    reveal_deadline: revealDeadline,
  };
}

/** Truncate address for display */
export function shortAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
