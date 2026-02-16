'use client';

import { useState } from 'react';
import { formatLaunch, fromMicroLaunch } from '@coinflip/shared/constants';
import { toMicroLaunch } from '@coinflip/shared/constants';
import {
  useAdminTreasuryBalance,
  useAdminTreasuryStats,
  useAdminTreasuryLedger,
  useAdminPlatformStats,
  useAdminWithdraw,
} from '@/hooks/use-admin';
import { useTranslation } from '@/lib/i18n';

// ---- Helpers ----

function fmtLaunch(micro: string | number): string {
  return formatLaunch(micro);
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 16) return hash ?? '';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---- Components ----

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
        {label}
      </p>
      <p className="text-xl font-bold">{value}</p>
      {sub && (
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ---- Main Page ----

export default function AdminPage() {
  const { t } = useTranslation();
  const balance = useAdminTreasuryBalance();
  const stats = useAdminTreasuryStats();
  const platform = useAdminPlatformStats();
  const withdraw = useAdminWithdraw();

  const [ledgerPage, setLedgerPage] = useState(0);
  const ledger = useAdminTreasuryLedger(ledgerPage);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    const humanAmount = parseFloat(withdrawAmount);
    if (!humanAmount || humanAmount <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }

    const microAmount = toMicroLaunch(humanAmount);

    try {
      const result = await withdraw.mutateAsync(microAmount);
      setWithdrawSuccess(`Withdrawn ${withdrawAmount} LAUNCH. Tx: ${result.txHash}`);
      setWithdrawAmount('');
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed');
    }
  };

  const isLoading = balance.isLoading || stats.isLoading || platform.isLoading;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
          <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('admin.title')}</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">{t('admin.subtitle')}</p>
        </div>
      </div>

      {/* Treasury Balance */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.treasuryBalance')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label={t('admin.vaultAvailable')}
            value={balance.data ? fmtLaunch(balance.data.vault.available) : '...'}
            sub={t('admin.launchInContract')}
          />
          <StatCard
            label={t('admin.vaultLocked')}
            value={balance.data ? fmtLaunch(balance.data.vault.locked) : '...'}
            sub={t('admin.inActiveBets')}
          />
          <StatCard
            label={t('admin.wallet')}
            value={balance.data ? fmtLaunch(balance.data.wallet.balance) : '...'}
            sub={t('admin.cw20InTreasury')}
          />
        </div>
      </section>

      {/* Commission Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.commissionStats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t('admin.totalEarned')}
            value={stats.data ? fmtLaunch(stats.data.totalCommissions) : '...'}
            sub={t('admin.allTime')}
          />
          <StatCard
            label={t('admin.last24h')}
            value={stats.data ? fmtLaunch(stats.data.last24h) : '...'}
          />
          <StatCard
            label={t('admin.last7d')}
            value={stats.data ? fmtLaunch(stats.data.last7d) : '...'}
          />
          <StatCard
            label={t('admin.totalEntries')}
            value={stats.data?.totalEntries ?? '...'}
          />
        </div>
      </section>

      {/* Platform Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.platformStats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label={t('admin.totalBets')}
            value={platform.data?.totalBets ?? '...'}
          />
          <StatCard
            label={t('admin.totalVolume')}
            value={platform.data ? fmtLaunch(platform.data.totalVolume) : '...'}
            sub={t('admin.launchWagered')}
          />
          <StatCard
            label={t('admin.totalUsers')}
            value={platform.data?.totalUsers ?? '...'}
          />
          <StatCard
            label={t('admin.activeBets')}
            value={platform.data?.activeBets ?? '...'}
            sub={t('admin.openPlusAccepted')}
          />
          <StatCard
            label={t('admin.resolvedBets')}
            value={platform.data?.resolvedBets ?? '...'}
          />
          <StatCard
            label={t('admin.canceledBets')}
            value={platform.data?.canceledBets ?? '...'}
          />
        </div>
      </section>

      {/* Withdraw */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.withdrawFromVault')}
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('admin.withdrawDesc', { amount: balance.data ? `${fmtLaunch(balance.data.vault.available)} ${t('common.launch')}` : '...' })}
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              step="any"
              min="0"
              value={withdrawAmount}
              onChange={(e) => {
                setWithdrawAmount(e.target.value);
                setWithdrawError('');
                setWithdrawSuccess('');
              }}
              placeholder={t('admin.amountPlaceholder')}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="button"
              disabled={withdraw.isPending || !withdrawAmount}
              onClick={handleWithdraw}
              className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold disabled:opacity-40 whitespace-nowrap"
            >
              {withdraw.isPending ? t('admin.withdrawing') : t('common.withdraw')}
            </button>
          </div>
          {/* Quick presets */}
          <div className="flex gap-2">
            {[100, 500, 1000, 5000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setWithdrawAmount(String(amt))}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-border)]/30 transition-colors"
              >
                {amt.toLocaleString()}
              </button>
            ))}
            {balance.data && BigInt(balance.data.vault.available) > 0n && (
              <button
                type="button"
                onClick={() => setWithdrawAmount(String(fromMicroLaunch(balance.data!.vault.available)))}
                className="rounded-lg border border-[var(--color-primary)]/30 text-[var(--color-primary)] px-3 py-1 text-xs hover:bg-[var(--color-primary)]/10 transition-colors"
              >
                {t('common.max')}
              </button>
            )}
          </div>
          {withdrawError && (
            <p className="text-xs text-[var(--color-danger)]">{withdrawError}</p>
          )}
          {withdrawSuccess && (
            <p className="text-xs text-[var(--color-success)]">{withdrawSuccess}</p>
          )}
        </div>
      </section>

      {/* Commission Ledger */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.commissionLedger')}
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <span>{t('admin.time')}</span>
            <span>{t('admin.amount')}</span>
            <span>{t('admin.source')}</span>
            <span>{t('admin.txHash')}</span>
          </div>

          {/* Table body */}
          {ledger.isLoading ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">
              {t('common.loading')}
            </div>
          ) : !ledger.data?.data?.length ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">
              {t('admin.noCommission')}
            </div>
          ) : (
            ledger.data.data.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50"
              >
                <span className="text-[var(--color-text-secondary)]" title={entry.createdAt}>
                  {timeAgo(entry.createdAt)}
                </span>
                <span className="font-mono font-bold">
                  +{fmtLaunch(entry.amount)}
                </span>
                <span className="text-[var(--color-text-secondary)]">{entry.source}</span>
                <span className="font-mono text-[var(--color-text-secondary)]" title={entry.txhash}>
                  {shortHash(entry.txhash)}
                </span>
              </div>
            ))
          )}

          {/* Pagination */}
          {ledger.data?.pagination && ledger.data.pagination.total > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                {t('admin.pageRange', {
                  start: ledger.data.pagination.offset + 1,
                  end: Math.min(
                    ledger.data.pagination.offset + ledger.data.pagination.limit,
                    ledger.data.pagination.total,
                  ),
                  total: ledger.data.pagination.total,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={ledgerPage === 0}
                  onClick={() => setLedgerPage((p) => Math.max(0, p - 1))}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30"
                >
                  {t('admin.prev')}
                </button>
                <button
                  type="button"
                  disabled={!ledger.data.pagination.hasMore}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30"
                >
                  {t('admin.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
