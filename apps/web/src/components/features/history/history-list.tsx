'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HistoryEntry {
  id: string;
  amount: number;
  role: 'creator' | 'acceptor';
  result: 'win' | 'loss';
  commission: number;
  payout: number;
  opponent: string;
  txHash: string;
  completedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: '1',
    amount: 100,
    role: 'creator',
    result: 'win',
    commission: 20,
    payout: 180,
    opponent: 'axiome1v4e5cc4hpf5rgzc3d8ntg0k7t3hrwlmfkaqdzv',
    txHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2',
    completedAt: new Date(Date.now() - 10 * 60_000),
  },
  {
    id: '2',
    amount: 50,
    role: 'acceptor',
    result: 'loss',
    commission: 0,
    payout: 0,
    opponent: 'axiome1pjf0s2klwgyqe9rdcwxn20g3kzq5au6yaxtxya',
    txHash: 'B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B200',
    completedAt: new Date(Date.now() - 30 * 60_000),
  },
  {
    id: '3',
    amount: 250,
    role: 'creator',
    result: 'win',
    commission: 50,
    payout: 450,
    opponent: 'axiome1mk8933ds3fh8a5v9pmnnzrq4jlh73jw4nr9c8v',
    txHash: 'C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B20044',
    completedAt: new Date(Date.now() - 2 * 3600_000),
  },
  {
    id: '4',
    amount: 500,
    role: 'acceptor',
    result: 'win',
    commission: 100,
    payout: 900,
    opponent: 'axiome1dxe2n8gq3rv74hxs3yz3mnnqafkr8c7v5qf2wz',
    txHash: 'D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2003355',
    completedAt: new Date(Date.now() - 5 * 3600_000),
  },
  {
    id: '5',
    amount: 25,
    role: 'creator',
    result: 'loss',
    commission: 0,
    payout: 0,
    opponent: 'axiome1t6aqvnf0aqze7xqvxr2gxksc4c9rjw2kylnz6m',
    txHash: 'E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B200334455',
    completedAt: new Date(Date.now() - 24 * 3600_000),
  },
];

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

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Placeholder explorer URL
const EXPLORER_BASE = 'https://explorer.axiome.pro/tx';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type ResultFilter = 'all' | 'win' | 'loss';

export function HistoryList() {
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  const filtered = resultFilter === 'all'
    ? MOCK_HISTORY
    : MOCK_HISTORY.filter((entry) => entry.result === resultFilter);

  const stats = {
    total: MOCK_HISTORY.length,
    wins: MOCK_HISTORY.filter((e) => e.result === 'win').length,
    losses: MOCK_HISTORY.filter((e) => e.result === 'loss').length,
    totalPayout: MOCK_HISTORY.reduce((sum, e) => sum + e.payout, 0),
  };

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
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Role</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Result</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Payout</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Commission</th>
              <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Opponent</th>
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
                {/* Amount */}
                <td className="px-4 py-3 font-bold tabular-nums">
                  {entry.amount.toLocaleString()} LAUNCH
                </td>

                {/* Role */}
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      entry.role === 'creator'
                        ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                        : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                    }`}
                  >
                    {entry.role === 'creator' ? 'Creator' : 'Acceptor'}
                  </span>
                </td>

                {/* Result */}
                <td className="px-4 py-3">
                  <span
                    className={`font-bold ${
                      entry.result === 'win'
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {entry.result === 'win' ? 'Win' : 'Loss'}
                  </span>
                </td>

                {/* Payout */}
                <td className="px-4 py-3 tabular-nums">
                  {entry.payout > 0 ? (
                    <span className="text-[var(--color-success)]">
                      +{entry.payout.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-secondary)]">—</span>
                  )}
                </td>

                {/* Commission */}
                <td className="px-4 py-3 tabular-nums text-[var(--color-text-secondary)]">
                  {entry.commission > 0 ? `-${entry.commission.toLocaleString()}` : '—'}
                </td>

                {/* Opponent */}
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                  {truncateAddress(entry.opponent)}
                </td>

                {/* Tx Hash */}
                <td className="px-4 py-3">
                  <a
                    href={`${EXPLORER_BASE}/${entry.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)] hover:underline"
                  >
                    {truncateTxHash(entry.txHash)}
                  </a>
                </td>

                {/* When */}
                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {formatTimeAgo(entry.completedAt)}
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
