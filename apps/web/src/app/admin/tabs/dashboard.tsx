'use client';

import { useState } from 'react';
import { formatLaunch, fromMicroLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import {
  useAdminTreasuryBalance,
  useAdminTreasuryStats,
  useAdminTreasuryLedger,
  useAdminPlatformStats,
  useAdminWithdraw,
  useAdminSweepPreview,
  useAdminSweepExecute,
  useAdminSweepStatus,
} from '@/hooks/use-admin';
import type { SweepSummary } from '@/hooks/use-admin';
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

  // Sweep state
  const sweepPreview = useAdminSweepPreview();
  const sweepExecute = useAdminSweepExecute();
  const sweepStatus = useAdminSweepStatus();
  const [sweepMaxUsers, setSweepMaxUsers] = useState(20);
  const [sweepResult, setSweepResult] = useState<SweepSummary | null>(null);

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

      {/* Treasury Sweep */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Treasury Sweep
        </h2>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Collect offchain_spent tokens from users&apos; vaults to treasury. Users paid for VIP/pins/announcements/raffles in DB,
            but tokens remain in the contract.
          </p>

          {/* Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">
                Candidates: {sweepPreview.data?.candidates.length ?? '...'}
              </span>
              <span className="text-xs font-bold text-[var(--color-primary)]">
                Total sweepable: {sweepPreview.data ? fmtLaunch(sweepPreview.data.totalSweepable) : '...'} LAUNCH
              </span>
            </div>

            {sweepPreview.data && sweepPreview.data.candidates.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                <div className="grid grid-cols-4 gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <span>Address</span>
                  <span>Debt</span>
                  <span>Chain Avail</span>
                  <span>Sweepable</span>
                </div>
                {sweepPreview.data.candidates.map((c) => (
                  <div key={c.userId} className="grid grid-cols-4 gap-2 px-3 py-1.5 text-xs border-b border-[var(--color-border)]/30 last:border-0">
                    <span className="font-mono truncate" title={c.address}>
                      {c.nickname || shortHash(c.address)}
                    </span>
                    <span className="font-mono">{fmtLaunch(c.offchainSpent)}</span>
                    <span className="font-mono">{fmtLaunch(c.chainAvailable)}</span>
                    <span className="font-mono font-bold text-[var(--color-primary)]">{fmtLaunch(c.sweepable)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execute */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-secondary)]">Max users:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={sweepMaxUsers}
              onChange={(e) => setSweepMaxUsers(Number(e.target.value) || 20)}
              className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="button"
              disabled={sweepExecute.isPending || sweepStatus.data?.running}
              onClick={async () => {
                setSweepResult(null);
                try {
                  const result = await sweepExecute.mutateAsync(sweepMaxUsers);
                  setSweepResult(result);
                  sweepPreview.refetch();
                } catch {
                  // error shown via mutation state
                }
              }}
              className="rounded-xl bg-[var(--color-primary)] px-6 py-2 text-xs font-bold disabled:opacity-40 whitespace-nowrap"
            >
              {sweepExecute.isPending || sweepStatus.data?.running ? 'Sweeping...' : 'Start Sweep'}
            </button>
            <button
              type="button"
              onClick={() => sweepPreview.refetch()}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs hover:bg-[var(--color-border)]/30 transition-colors"
            >
              Refresh
            </button>
          </div>

          {sweepExecute.error && (
            <p className="text-xs text-[var(--color-danger)]">
              {sweepExecute.error instanceof Error ? sweepExecute.error.message : 'Sweep failed'}
            </p>
          )}

          {/* Results */}
          {sweepResult && (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs">
                <span className="text-[var(--color-success)]">Succeeded: {sweepResult.succeeded}</span>
                <span className="text-[var(--color-danger)]">Failed: {sweepResult.failed}</span>
                <span className="text-[var(--color-text-secondary)]">Skipped: {sweepResult.skipped}</span>
                <span className="font-bold">Total swept: {fmtLaunch(sweepResult.totalSwept)} LAUNCH</span>
              </div>
              {sweepResult.results.filter((r) => r.status !== 'skipped').length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                  {sweepResult.results
                    .filter((r) => r.status !== 'skipped')
                    .map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-3 py-1.5 text-xs border-b border-[var(--color-border)]/30 last:border-0 ${
                          r.status === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                        }`}
                      >
                        <span>{r.status === 'success' ? '+' : 'x'}</span>
                        <span className="font-mono truncate">{shortHash(r.address)}</span>
                        <span className="font-mono">{fmtLaunch(r.amount)}</span>
                        {r.error && <span className="text-[var(--color-danger)] truncate">{r.error}</span>}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
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
