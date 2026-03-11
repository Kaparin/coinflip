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
  useAdminEconomyOverview,
} from '@/hooks/use-admin';
import type { SweepSummary } from '@/hooks/use-admin';
import { StatCard, shortHash, timeAgo } from '../_shared';

function fmt(micro: string | number): string {
  return formatLaunch(micro);
}

/* ═══════════════════════════════════════════════════════
   Section: Analytics (P&L, Treasury, COIN, Platform)
   ═══════════════════════════════════════════════════════ */

export function DashboardAnalytics() {
  const balance = useAdminTreasuryBalance();
  const stats = useAdminTreasuryStats();
  const platform = useAdminPlatformStats();
  const economy = useAdminEconomyOverview();
  const eco = economy.data;

  return (
    <div className="space-y-6">
      {/* ═══ AXM P&L ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          AXM — Доходы и расходы платформы
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Комиссия 10%"
            value={eco ? fmt(eco.betting.totalCommission) : '...'}
            sub={eco ? `${eco.betting.resolvedBets} ставок` : ''}
          />
          <StatCard
            label="Рефералам"
            value={eco ? fmt(eco.axm.referralPaid) : '...'}
            sub={eco ? `${eco.axm.referralCount} выплат` : ''}
          />
          <StatCard
            label="Джекпот (накоплен)"
            value={eco ? fmt(eco.axm.jackpotContributed ?? '0') : '...'}
            sub={eco ? `выплачено: ${fmt(eco.axm.jackpotPaid)}` : ''}
          />
          <StatCard
            label="Стейкинг LAUNCH"
            value={eco ? fmt(eco.axm.stakingAccrued ?? '0') : '...'}
            sub={eco ? `pending: ${fmt(eco.axm.stakingPending ?? '0')}` : ''}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Доля команды"
            value={eco ? fmt(eco.axm.teamShare ?? '0') : '...'}
            sub="10% − рефералы − джекпот − стейкинг − партнёры"
          />
          <StatCard
            label="Treasury swept"
            value={eco ? fmt(eco.axm.treasurySwept ?? '0') : '...'}
            sub={eco ? `${eco.axm.treasurySweptEntries ?? 0} операций` : ''}
          />
          <StatCard
            label="Комиссия за 24ч / 7д"
            value={stats.data ? `${fmt(stats.data.last24h)} / ${fmt(stats.data.last7d)}` : '...'}
          />
        </div>
      </section>

      {/* ═══ AXM Treasury ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          AXM — Казна (контракт + кошелёк)
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Контракт (доступно)"
            value={balance.data ? fmt(balance.data.vault.available) : '...'}
            sub="AXM в контракте"
          />
          <StatCard
            label="Контракт (заблокировано)"
            value={balance.data ? fmt(balance.data.vault.locked) : '...'}
            sub="в активных ставках"
          />
          <StatCard
            label="Кошелёк казны"
            value={balance.data ? fmt(balance.data.wallet.balance) : '...'}
            sub="AXM на кошельке"
          />
          <StatCard
            label="Юзеры AXM (vault)"
            value={eco ? `${eco.vaultTotals.usersWithBalance} чел.` : '...'}
            sub={eco ? `всего: ${fmt(eco.vaultTotals.totalAvailable)}` : ''}
          />
        </div>
      </section>

      {/* ═══ COIN Economy ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
          COIN — Виртуальная валюта
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="В обращении"
            value={eco ? fmt(eco.coin.totalCirculating) : '...'}
            sub={eco ? `у ${eco.coin.holdersCount} юзеров` : ''}
          />
          <StatCard
            label="Продано через магазин"
            value={eco ? fmt(eco.coin.shopSold) : '...'}
            sub={eco ? `${eco.coin.shopPurchases} покупок (${eco.coin.shopUniqueBuyers} юзеров)` : ''}
          />
          <StatCard
            label="Выручка магазина (AXM)"
            value={eco ? fmt(eco.coin.shopAxmRevenue) : '...'}
            sub="AXM получено за COIN"
          />
          <StatCard
            label="Ачивки"
            value={eco ? fmt(eco.coin.achievementsClaimed) : '...'}
            sub={eco ? `${eco.coin.achievementsCount} клеймов` : ''}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Переводы P2P"
            value={eco ? fmt(eco.coin.transfersTotal) : '...'}
            sub={eco ? `${eco.coin.transfersCount} перевод. / сожжено: ${fmt(eco.coin.transfersFees)}` : ''}
          />
          <StatCard
            label="CoinDrop (чат)"
            value={eco ? fmt(eco.coin.coinDropsTotal) : '...'}
            sub="роздано через чат"
          />
        </div>
      </section>

      {/* ═══ Platform Stats ═══ */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Игровая статистика
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Всего ставок" value={platform.data?.totalBets ?? '...'} />
          <StatCard label="Общий объём (AXM)" value={platform.data ? fmt(platform.data.totalVolume) : '...'} />
          <StatCard label="Всего юзеров" value={platform.data?.totalUsers ?? '...'} />
          <StatCard label="Активные ставки" value={platform.data?.activeBets ?? '...'} sub="open + accepted" />
          <StatCard label="Разрешённые" value={platform.data?.resolvedBets ?? '...'} />
          <StatCard label="Отменённые" value={platform.data?.canceledBets ?? '...'} />
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Treasury Withdraw
   ═══════════════════════════════════════════════════════ */

export function TreasuryWithdrawSection() {
  const balance = useAdminTreasuryBalance();
  const withdraw = useAdminWithdraw();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');
    const humanAmount = parseFloat(withdrawAmount);
    if (!humanAmount || humanAmount <= 0) {
      setWithdrawError('Введите корректную сумму');
      return;
    }
    const microAmount = toMicroLaunch(humanAmount);
    try {
      const result = await withdraw.mutateAsync(microAmount);
      setWithdrawSuccess(`Выведено ${withdrawAmount} AXM. Tx: ${result.txHash}`);
      setWithdrawAmount('');
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Ошибка вывода');
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Вывод AXM из контракта
      </h2>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Доступно для вывода: {balance.data ? `${fmt(balance.data.vault.available)} AXM` : '...'}
        </p>
        <div className="flex gap-3">
          <input
            type="number"
            step="any"
            min="0"
            value={withdrawAmount}
            onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawError(''); setWithdrawSuccess(''); }}
            placeholder="Сумма AXM"
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button
            type="button"
            disabled={withdraw.isPending || !withdrawAmount}
            onClick={handleWithdraw}
            className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold disabled:opacity-40 whitespace-nowrap"
          >
            {withdraw.isPending ? 'Вывод...' : 'Вывести AXM'}
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
              Макс
            </button>
          )}
        </div>
        {withdrawError && <p className="text-xs text-[var(--color-danger)]">{withdrawError}</p>}
        {withdrawSuccess && <p className="text-xs text-[var(--color-success)]">{withdrawSuccess}</p>}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Treasury Sweep
   ═══════════════════════════════════════════════════════ */

export function TreasurySweepSection() {
  const sweepPreview = useAdminSweepPreview();
  const sweepExecute = useAdminSweepExecute();
  const sweepStatus = useAdminSweepStatus();
  const [sweepMaxUsers, setSweepMaxUsers] = useState(20);
  const [sweepResult, setSweepResult] = useState<SweepSummary | null>(null);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Сбор средств (Sweep)
      </h2>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Сбор offchain_spent AXM из хранилищ пользователей в казну. Пользователи оплатили VIP/пины/анонсы в БД,
          но токены остаются в контракте.
        </p>

        {/* Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">
              Кандидаты: {sweepPreview.data?.candidates.length ?? '...'}
            </span>
            <span className="text-xs font-bold text-[var(--color-primary)]">
              Всего к сбору: {sweepPreview.data ? fmt(sweepPreview.data.totalSweepable) : '...'} AXM
            </span>
          </div>

          {sweepPreview.data && sweepPreview.data.candidates.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border)]">
              <div className="hidden sm:grid grid-cols-4 gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                <span>Адрес</span>
                <span>Долг</span>
                <span>Доступно (чейн)</span>
                <span>К сбору</span>
              </div>
              {sweepPreview.data.candidates.map((c) => (
                <div key={c.userId} className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2 px-3 py-1.5 text-xs border-b border-[var(--color-border)]/30 last:border-0">
                  <span className="font-mono truncate" title={c.address}>
                    {c.nickname || shortHash(c.address)}
                  </span>
                  <span className="font-mono">{fmt(c.offchainSpent)}</span>
                  <span className="font-mono">{fmt(c.chainAvailable)}</span>
                  <span className="font-mono font-bold text-[var(--color-primary)]">{fmt(c.sweepable)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execute */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-[var(--color-text-secondary)]">Макс. юзеров:</label>
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
            {sweepExecute.isPending || sweepStatus.data?.running ? 'Сбор...' : 'Начать сбор'}
          </button>
          <button
            type="button"
            onClick={() => sweepPreview.refetch()}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs hover:bg-[var(--color-border)]/30 transition-colors"
          >
            Обновить
          </button>
        </div>

        {sweepExecute.error && (
          <p className="text-xs text-[var(--color-danger)]">
            {sweepExecute.error instanceof Error ? sweepExecute.error.message : 'Сбор не удался'}
          </p>
        )}

        {/* Results */}
        {sweepResult && (
          <div className="space-y-2">
            <div className="flex gap-4 text-xs">
              <span className="text-[var(--color-success)]">Успешно: {sweepResult.succeeded}</span>
              <span className="text-[var(--color-danger)]">Ошибки: {sweepResult.failed}</span>
              <span className="text-[var(--color-text-secondary)]">Пропущено: {sweepResult.skipped}</span>
              <span className="font-bold">Всего собрано: {fmt(sweepResult.totalSwept)} AXM</span>
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
                      <span className="font-mono">{fmt(r.amount)}</span>
                      {r.error && <span className="text-[var(--color-danger)] truncate">{r.error}</span>}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Commission Ledger
   ═══════════════════════════════════════════════════════ */

export function CommissionLedgerSection() {
  const [ledgerPage, setLedgerPage] = useState(0);
  const ledger = useAdminTreasuryLedger(ledgerPage);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Журнал комиссий (AXM)
      </h2>
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="hidden sm:grid grid-cols-4 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <span>Время</span>
          <span>Сумма</span>
          <span>Источник</span>
          <span>TX Hash</span>
        </div>

        {ledger.isLoading ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">Загрузка...</div>
        ) : !ledger.data?.data?.length ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--color-text-secondary)]">Нет записей</div>
        ) : (
          ledger.data.data.map((entry) => (
            <div key={entry.id} className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2 px-4 py-2.5 text-xs border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50">
              <span className="text-[var(--color-text-secondary)]" title={entry.createdAt}>{timeAgo(entry.createdAt)}</span>
              <span className="font-mono font-bold">+{fmt(entry.amount)}</span>
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
                Назад
              </button>
              <button type="button" disabled={!ledger.data.pagination.hasMore} onClick={() => setLedgerPage((p) => p + 1)} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30">
                Далее
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   Combined DashboardTab (backwards compat)
   ═══════════════════════════════════════════════════════ */

export function DashboardTab() {
  return (
    <div className="space-y-6">
      <DashboardAnalytics />
      <TreasuryWithdrawSection />
      <TreasurySweepSection />
      <CommissionLedgerSection />
    </div>
  );
}
