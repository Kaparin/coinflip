'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { useAdminDiagnostics, useAdminPendingSecrets } from '@/hooks/use-admin';
import { StatCard, shortAddr, timeAgo, TableWrapper } from '../_shared';

export function DiagnosticsTab() {
  const diagnostics = useAdminDiagnostics();
  const pendingSecrets = useAdminPendingSecrets();

  const d = diagnostics.data;

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-text-secondary)]">
        System health check — auto-refreshes every 30 seconds.
        {d && <span className="ml-2">Last update: {new Date(d.timestamp).toLocaleTimeString()}</span>}
      </p>

      {/* Bet Status Distribution */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Bet Status Distribution
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={d?.bets.total ?? '...'} />
          <StatCard label="Open" value={d?.bets.open ?? '...'} />
          <StatCard label="Accepted" value={d?.bets.accepted ?? '...'} />
          <StatCard label="Revealed" value={d?.bets.revealed ?? '...'} />
          <StatCard label="Canceled" value={d?.bets.canceled ?? '...'} />
          <StatCard label="Timeout" value={d?.bets.timeout ?? '...'} />
          <StatCard label="Accepting" value={d?.bets.accepting ?? '...'} warn={(d?.bets.accepting ?? 0) > 0} />
          <StatCard label="Canceling" value={d?.bets.canceling ?? '...'} warn={(d?.bets.canceling ?? 0) > 0} />
          <StatCard label="Creating" value={d?.bets.creating ?? '...'} warn={(d?.bets.creating ?? 0) > 0} />
          <StatCard label="Missing Secrets" value={d?.bets.missingSecrets ?? '...'} warn={(d?.bets.missingSecrets ?? 0) > 0} sub="accepted w/o secret" />
        </div>
      </section>

      {/* Vault Health */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Vault Health
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Users with balance" value={d?.vault.totalUsers ?? '...'} />
          <StatCard label="Total Available" value={d ? formatLaunch(d.vault.totalAvailable) : '...'} />
          <StatCard label="Total Locked" value={d ? formatLaunch(d.vault.totalLocked) : '...'} />
          <StatCard label="Users with locked" value={d?.vault.usersWithLocked ?? '...'} />
          <StatCard label="Negative Available" value={d?.vault.negativeAvailable ?? '...'} warn={(d?.vault.negativeAvailable ?? 0) > 0} />
          <StatCard label="Negative Locked" value={d?.vault.negativeLocked ?? '...'} warn={(d?.vault.negativeLocked ?? 0) > 0} />
        </div>
      </section>

      {/* Stuck Locked Funds */}
      {d?.stuckLockedFunds && d.stuckLockedFunds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-danger)]">
            Stuck Locked Funds ({d.stuckLockedFunds.length})
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Users with locked balance but no active bets. These funds are effectively frozen.
          </p>
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">Address</th>
                  <th className="text-right px-3 py-2">Locked Amount</th>
                  <th className="text-left px-3 py-2">User ID</th>
                </tr>
              </thead>
              <tbody>
                {d.stuckLockedFunds.map((s) => (
                  <tr key={s.userId} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono" title={s.address}>{shortAddr(s.address)}</td>
                    <td className="px-3 py-2 text-right font-mono text-yellow-400">{formatLaunch(s.locked)}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)] text-[10px]">{s.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        </section>
      )}

      {/* Coin Flip Randomness (since server start) */}
      {d?.coinFlipStats && d.coinFlipStats.total > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Coin Flip Randomness (since server start)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Heads" value={d.coinFlipStats.heads} sub={`${d.coinFlipStats.total > 0 ? ((d.coinFlipStats.heads / d.coinFlipStats.total) * 100).toFixed(1) : 0}%`} />
            <StatCard label="Tails" value={d.coinFlipStats.tails} sub={`${d.coinFlipStats.total > 0 ? ((d.coinFlipStats.tails / d.coinFlipStats.total) * 100).toFixed(1) : 0}%`} />
            <StatCard label="Total Flips" value={d.coinFlipStats.total} sub="crypto.randomBytes" />
          </div>
        </section>
      )}

      {/* Pending Bet Secrets */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Pending Bet Secrets ({d?.pendingSecrets.count ?? '...'})
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Secrets stored before broadcast that haven&apos;t been consumed yet. Old entries ({'>'}1h) are auto-cleaned.
        </p>

        {pendingSecrets.data && pendingSecrets.data.length > 0 ? (
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">Commitment</th>
                  <th className="text-left px-3 py-2">Side</th>
                  <th className="text-left px-3 py-2">TX Hash</th>
                  <th className="text-left px-3 py-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {pendingSecrets.data.map((s, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono text-[10px]">{s.commitment}</td>
                    <td className="px-3 py-2">{s.makerSide}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{s.txHash ? shortAddr(s.txHash) : '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">{s.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-green-400">
            No pending secrets — all bets resolved normally
          </div>
        )}
      </section>
    </div>
  );
}
