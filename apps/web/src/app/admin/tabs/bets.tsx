'use client';

import { useState, useCallback } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useAdminBets,
  useAdminStuckBets,
  useAdminMissingSecrets,
  useAdminOrphanedBets,
  useAdminImportOrphaned,
  useAdminForceCancel,
  useAdminRecoverSecret,
} from '@/hooks/use-admin';
import {
  shortAddr,
  shortHash,
  timeAgo,
  StatusBadge,
  TableWrapper,
  Pagination,
  SearchInput,
  ActionButton,
} from '../_shared';

const STATUS_FILTERS = ['', 'open', 'accepted', 'accepting', 'canceling', 'revealed', 'canceled', 'timeout_claimed'] as const;

export function BetsTab() {
  const [subTab, setSubTab] = useState<'all' | 'stuck' | 'missing' | 'orphaned'>('all');

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all' as const, label: 'All Bets' },
          { id: 'stuck' as const, label: 'Stuck' },
          { id: 'missing' as const, label: 'Missing Secrets' },
          { id: 'orphaned' as const, label: 'Orphaned (Chain)' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subTab === id
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'all' && <AllBets />}
      {subTab === 'stuck' && <StuckBets />}
      {subTab === 'missing' && <MissingSecrets />}
      {subTab === 'orphaned' && <OrphanedBets />}
    </div>
  );
}

function AllBets() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const bets = useAdminBets(page, 50, status, debouncedSearch);
  const forceCancel = useAdminForceCancel();

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    const timeout = setTimeout(() => { setDebouncedSearch(val); setPage(0); }, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search bet ID, tx hash..." />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Maker</th>
              <th className="text-left px-3 py-2">Acceptor</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Secret</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bets.isLoading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Loading...</td></tr>
            ) : !bets.data?.data.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">No bets found</td></tr>
            ) : (
              bets.data.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 font-mono" title={b.maker}>{shortAddr(b.maker)}</td>
                  <td className="px-3 py-2 font-mono" title={b.acceptor ?? undefined}>{b.acceptor ? shortAddr(b.acceptor) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2">
                    <span className={b.hasSecret ? 'text-green-400' : 'text-red-400'}>{b.hasSecret ? 'Yes' : 'No'}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.createdTime)}</td>
                  <td className="px-3 py-2">
                    {['open', 'accepting', 'canceling', 'accepted'].includes(b.status) && (
                      <ActionButton
                        variant="danger"
                        disabled={forceCancel.isPending}
                        onClick={() => {
                          if (confirm(`Force-cancel bet #${b.betId}?`)) {
                            forceCancel.mutate(Number(b.betId));
                          }
                        }}
                      >
                        Cancel
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {bets.data?.pagination && bets.data.pagination.total > 0 && (
          <Pagination
            page={page}
            total={bets.data.pagination.total}
            limit={bets.data.pagination.limit}
            hasMore={bets.data.pagination.hasMore}
            onPageChange={setPage}
          />
        )}
      </TableWrapper>
    </div>
  );
}

function StuckBets() {
  const stuck = useAdminStuckBets();
  const forceCancel = useAdminForceCancel();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Bets in transitional states (creating/accepting/canceling) for more than 5 minutes.
      </p>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Age</th>
              <th className="text-left px-3 py-2">TX Hash</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stuck.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Loading...</td></tr>
            ) : !stuck.data?.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-green-400">No stuck bets</td></tr>
            ) : (
              stuck.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2 text-yellow-400">{b.age}</td>
                  <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]" title={b.txhashCreate}>{shortHash(b.txhashCreate)}</td>
                  <td className="px-3 py-2">
                    <ActionButton
                      variant="danger"
                      disabled={forceCancel.isPending}
                      onClick={() => {
                        if (confirm(`Force-cancel stuck bet #${b.betId}?`)) {
                          forceCancel.mutate(Number(b.betId));
                        }
                      }}
                    >
                      Force Cancel
                    </ActionButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}

function MissingSecrets() {
  const missing = useAdminMissingSecrets();
  const recoverSecret = useAdminRecoverSecret();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Accepted bets without maker_secret — auto-reveal cannot work. If &quot;Recoverable&quot; is Yes, the secret can be restored from pending_bet_secrets.
      </p>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Accepted</th>
              <th className="text-left px-3 py-2">Recoverable</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {missing.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Loading...</td></tr>
            ) : !missing.data?.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-green-400">No missing secrets</td></tr>
            ) : (
              missing.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.createdTime)}</td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.acceptedTime)}</td>
                  <td className="px-3 py-2">
                    <span className={b.secretRecoverable ? 'text-green-400' : 'text-red-400'}>
                      {b.secretRecoverable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {b.secretRecoverable && (
                      <ActionButton
                        variant="success"
                        disabled={recoverSecret.isPending}
                        onClick={() => recoverSecret.mutate(Number(b.betId))}
                      >
                        Recover
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}

function OrphanedBets() {
  const orphaned = useAdminOrphanedBets();
  const importOrphaned = useAdminImportOrphaned();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Bets present on the blockchain but missing from the database. These are typically caused by failed background tasks during batch operations.
      </p>

      {orphaned.data && (
        <div className="flex gap-3 text-xs">
          <span className="text-[var(--color-text-secondary)]">Chain: <strong>{orphaned.data.chainTotal}</strong> open</span>
          <span className="text-[var(--color-text-secondary)]">DB: <strong>{orphaned.data.dbTotal}</strong> total</span>
          <span className={orphaned.data.orphanedCount > 0 ? 'text-yellow-400 font-bold' : 'text-green-400'}>
            Orphaned: {orphaned.data.orphanedCount}
          </span>
        </div>
      )}

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">Chain ID</th>
              <th className="text-left px-3 py-2">Maker</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Secret</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orphaned.isLoading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Querying chain...</td></tr>
            ) : !orphaned.data?.orphaned.length ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-green-400">No orphaned bets</td></tr>
            ) : (
              orphaned.data.orphaned.map((b) => (
                <tr key={b.chainBetId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.chainBetId}</td>
                  <td className="px-3 py-2 font-mono" title={b.maker}>{shortAddr(b.maker)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={b.secretAvailable ? 'text-green-400' : 'text-red-400'}>
                      {b.secretAvailable ? 'Available' : 'Missing'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ActionButton
                      variant="success"
                      disabled={importOrphaned.isPending}
                      onClick={() => {
                        if (confirm(`Import bet #${b.chainBetId} from chain to DB?`)) {
                          importOrphaned.mutate(b.chainBetId);
                        }
                      }}
                    >
                      Import
                    </ActionButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}
