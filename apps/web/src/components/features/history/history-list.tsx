'use client';

import { useState, useMemo } from 'react';
import { useGetBetHistory, type Bet } from '@coinflip/api-client';
import { Skeleton } from '@/components/ui/skeleton';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EXPLORER_BASE = 'https://axiomechain.org/tx';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type ResultFilter = 'all' | 'win' | 'loss';

function getResult(bet: Bet, userAddress: string): 'win' | 'loss' | 'pending' {
  if (!bet.winner) return 'pending';
  return bet.winner === userAddress ? 'win' : 'loss';
}

export function HistoryList() {
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  const { data, isLoading } = useGetBetHistory({ limit: 50 });
  const bets = data?.data ?? [];

  // TODO: Replace with actual connected user address
  const userAddress = '';

  const enrichedBets = useMemo(
    () =>
      bets.map((bet) => ({
        ...bet,
        result: getResult(bet, userAddress),
        role: (bet.maker === userAddress ? 'creator' : 'acceptor') as 'creator' | 'acceptor',
      })),
    [bets, userAddress],
  );

  const filtered = resultFilter === 'all'
    ? enrichedBets
    : enrichedBets.filter((entry) => entry.result === resultFilter);

  const stats = {
    total: enrichedBets.length,
    wins: enrichedBets.filter((e) => e.result === 'win').length,
    losses: enrichedBets.filter((e) => e.result === 'loss').length,
    totalPayout: enrichedBets.reduce((sum, e) => sum + Number(e.payout_amount ?? 0), 0),
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="mb-6 flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-[var(--color-text-secondary)]">Bets: </span>
          <span className="font-bold">{stats.total}</span>
        </div>
        <div>
          <span className="text-[var(--color-text-secondary)]">Wins: </span>
          <span className="font-bold text-[var(--color-success)]">{stats.wins}</span>
        </div>
        <div>
          <span className="text-[var(--color-text-secondary)]">Losses: </span>
          <span className="font-bold text-[var(--color-danger)]">{stats.losses}</span>
        </div>
        <div>
          <span className="text-[var(--color-text-secondary)]">Total Payout: </span>
          <span className="font-bold">{stats.totalPayout.toLocaleString()} LAUNCH</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1.5">
        {(['all', 'win', 'loss'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setResultFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              resultFilter === f
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {f === 'all' ? 'All' : f === 'win' ? 'Wins' : 'Losses'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Amount</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Result</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Payout</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Maker</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Tx</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">When</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-[var(--color-border)] last:border-b-0 transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                <td className="px-4 py-3 font-bold tabular-nums">
                  {Number(entry.amount).toLocaleString()} LAUNCH
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      entry.status === 'revealed'
                        ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                        : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                    }`}
                  >
                    {entry.status}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`font-bold ${
                      entry.result === 'win'
                        ? 'text-[var(--color-success)]'
                        : entry.result === 'loss'
                          ? 'text-[var(--color-danger)]'
                          : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {entry.result === 'win' ? 'Win' : entry.result === 'loss' ? 'Loss' : 'Pending'}
                  </span>
                </td>

                <td className="px-4 py-3 tabular-nums">
                  {entry.payout_amount && Number(entry.payout_amount) > 0 ? (
                    <span className="text-[var(--color-success)]">
                      +{Number(entry.payout_amount).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-secondary)]">—</span>
                  )}
                </td>

                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                  {truncateAddress(entry.maker)}
                </td>

                <td className="px-4 py-3">
                  <a
                    href={`${EXPLORER_BASE}/${entry.txhash_create}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)] hover:underline"
                  >
                    {truncateTxHash(entry.txhash_create)}
                  </a>
                </td>

                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {formatTimeAgo(entry.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl">📜</span>
            <p className="text-sm text-[var(--color-text-secondary)]">
              No matching history entries
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
