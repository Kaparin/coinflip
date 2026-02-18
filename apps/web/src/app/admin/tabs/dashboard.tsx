'use client';

import { useState } from 'react';
import { formatLaunch, fromMicroLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import {
  useAdminTreasuryBalance,
  useAdminTreasuryStats,
  useAdminTreasuryLedger,
  useAdminPlatformStats,
  useAdminWithdraw,
} from '@/hooks/use-admin';
import { useTranslation } from '@/lib/i18n';
import { StatCard, shortHash, timeAgo } from '../_shared';

function fmtLaunch(micro: string | number): string {
  return formatLaunch(micro);
}

export function DashboardTab() {
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

  return (
    <div className="space-y-6">
      {/* Treasury Balance */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.treasuryBalance')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={t('admin.vaultAvailable')} value={balance.data ? fmtLaunch(balance.data.vault.available) : '...'} sub={t('admin.launchInContract')} />
          <StatCard label={t('admin.vaultLocked')} value={balance.data ? fmtLaunch(balance.data.vault.locked) : '...'} sub={t('admin.inActiveBets')} />
          <StatCard label={t('admin.wallet')} value={balance.data ? fmtLaunch(balance.data.wallet.balance) : '...'} sub={t('admin.cw20InTreasury')} />
        </div>
      </section>

      {/* Commission Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.commissionStats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('admin.totalEarned')} value={stats.data ? fmtLaunch(stats.data.totalCommissions) : '...'} sub={t('admin.allTime')} />
          <StatCard label={t('admin.last24h')} value={stats.data ? fmtLaunch(stats.data.last24h) : '...'} />
          <StatCard label={t('admin.last7d')} value={stats.data ? fmtLaunch(stats.data.last7d) : '...'} />
          <StatCard label={t('admin.totalEntries')} value={stats.data?.totalEntries ?? '...'} />
        </div>
      </section>

      {/* Platform Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.platformStats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={t('admin.totalBets')} value={platform.data?.totalBets ?? '...'} />
          <StatCard label={t('admin.totalVolume')} value={platform.data ? fmtLaunch(platform.data.totalVolume) : '...'} sub={t('admin.launchWagered')} />
          <StatCard label={t('admin.totalUsers')} value={platform.data?.totalUsers ?? '...'} />
          <StatCard label={t('admin.activeBets')} value={platform.data?.activeBets ?? '...'} sub={t('admin.openPlusAccepted')} />
          <StatCard label={t('admin.resolvedBets')} value={platform.data?.resolvedBets ?? '...'} />
          <StatCard label={t('admin.canceledBets')} value={platform.data?.canceledBets ?? '...'} />
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
              onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawError(''); setWithdrawSuccess(''); }}
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
          <div className="flex gap-2">
            {[100, 500, 1000, 5000].map((amt) => (
              <button key={amt} type="button" onClick={() => setWithdrawAmount(String(amt))} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-border)]/30 transition-colors">
                {amt.toLocaleString()}
              </button>
            ))}
            {balance.data && BigInt(balance.data.vault.available) > 0n && (
              <button type="button" onClick={() => setWithdrawAmount(String(fromMicroLaunch(balance.data!.vault.available)))} className="rounded-lg border border-[var(--color-primary)]/30 text-[var(--color-primary)] px-3 py-1 text-xs hover:bg-[var(--color-primary)]/10 transition-colors">
                {t('common.max')}
              </button>
            )}
          </div>
          {withdrawError && <p className="text-xs text-[var(--color-danger)]">{withdrawError}</p>}
          {withdrawSuccess && <p className="text-xs text-[var(--color-success)]">{withdrawSuccess}</p>}
        </div>
      </section>

      {/* Commission Ledger */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {t('admin.commissionLedger')}
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <span>{t('admin.time')}</span>
            <span>{t('admin.amount')}</span>
            <span>{t('admin.source')}</span>
            <span>{t('admin.txHash')}</span>
          </div>

          {ledger.isLoading ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">{t('common.loading')}</div>
          ) : !ledger.data?.data?.length ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">{t('admin.noCommission')}</div>
          ) : (
            ledger.data.data.map((entry) => (
              <div key={entry.id} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50">
                <span className="text-[var(--color-text-secondary)]" title={entry.createdAt}>{timeAgo(entry.createdAt)}</span>
                <span className="font-mono font-bold">+{fmtLaunch(entry.amount)}</span>
                <span className="text-[var(--color-text-secondary)]">{entry.source}</span>
                <span className="font-mono text-[var(--color-text-secondary)]" title={entry.txhash}>{shortHash(entry.txhash)}</span>
              </div>
            ))
          )}

          {ledger.data?.pagination && ledger.data.pagination.total > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                {ledger.data.pagination.offset + 1}–{Math.min(ledger.data.pagination.offset + ledger.data.pagination.limit, ledger.data.pagination.total)} of {ledger.data.pagination.total}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={ledgerPage === 0} onClick={() => setLedgerPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30">
                  {t('admin.prev')}
                </button>
                <button type="button" disabled={!ledger.data.pagination.hasMore} onClick={() => setLedgerPage((p) => p + 1)} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30">
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
