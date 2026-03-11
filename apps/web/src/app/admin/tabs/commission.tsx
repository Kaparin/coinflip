'use client';

import { useState } from 'react';
import { PieChart, Plus, Trash2, Loader2, TrendingUp, Send, CheckCircle, AlertCircle, Wallet, Banknote } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useAdminCommissionBreakdown,
  useAdminPartners,
  useAdminAddPartner,
  useAdminUpdatePartner,
  useAdminDeletePartner,
  useAdminConfig,
  useAdminUpdateConfig,
  useAdminEconomyOverview,
  useAdminStakingStats,
  useAdminStakingFlush,
  useAdminWithdraw,
  useAdminPartnerPayout,
  type AdminPartner,
  type PartnerPayoutResult,
} from '@/hooks/use-admin';
import { StatCard, TableWrapper, ActionButton, shortAddr } from '../_shared';

/* ═══════════════════════════════════════════════════════
   Section: Commission 10% Breakdown (analytics)
   ═══════════════════════════════════════════════════════ */

export function CommissionBreakdownSection() {
  const { data: breakdown, isLoading: breakdownLoading } = useAdminCommissionBreakdown();
  const economy = useAdminEconomyOverview();
  const withdraw = useAdminWithdraw();
  const [withdrawResult, setWithdrawResult] = useState<{ txHash: string; amount: string } | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  if (breakdownLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const bd = breakdown?.breakdown;
  const eco = economy.data;

  return (
    <div className="space-y-6">
      {/* ═══ Commission 10% Breakdown ═══ */}
      {eco && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Комиссия 10% — разбивка
          </h3>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
            {(() => {
              const totalComm = BigInt(eco.betting.totalCommission);
              const referrals = BigInt(eco.axm.referralPaid);
              const jackpot = BigInt(eco.axm.jackpotContributed ?? '0');
              const staking = BigInt(eco.axm.stakingAccrued ?? '0');
              const partners = BigInt(eco.axm.partnerPaid);
              const team = BigInt(eco.axm.teamShare ?? '0');

              const pct = (v: bigint) => totalComm > 0n ? Number((v * 10000n) / totalComm) / 100 : 0;

              const segments = [
                { label: 'Рефералы', value: referrals, color: 'bg-blue-500', textColor: 'text-blue-400' },
                { label: 'Джекпот', value: jackpot, color: 'bg-purple-500', textColor: 'text-purple-400' },
                { label: 'Стейкинг', value: staking, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
                { label: 'Партнёры', value: partners, color: 'bg-teal-500', textColor: 'text-teal-400' },
                { label: 'Казна (команда)', value: team, color: 'bg-amber-500', textColor: 'text-amber-400' },
              ];

              return (
                <>
                  {/* Big total card */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Общая комиссия 10%</p>
                      <p className="text-3xl font-bold">{formatLaunch(eco.betting.totalCommission)} <span className="text-base text-[var(--color-text-secondary)]">AXM</span></p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">из {eco.betting.resolvedBets} разыгранных ставок</p>
                    </div>
                  </div>

                  {/* Visual bar */}
                  <div className="flex h-8 overflow-hidden rounded-full border border-[var(--color-border)]">
                    {segments.map((s) => {
                      const p = pct(s.value);
                      if (p <= 0) return null;
                      return (
                        <div
                          key={s.label}
                          className={`${s.color} flex items-center justify-center text-[9px] font-bold text-white transition-all`}
                          style={{ width: `${Math.max(p, 3)}%` }}
                          title={`${s.label}: ${formatLaunch(s.value.toString())} AXM (${p.toFixed(1)}%)`}
                        >
                          {p >= 8 ? `${s.label} ${p.toFixed(0)}%` : p >= 4 ? `${p.toFixed(0)}%` : ''}
                        </div>
                      );
                    })}
                  </div>

                  {/* Per-category cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {segments.map((s) => (
                      <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`h-2 w-2 rounded-full ${s.color}`} />
                          <p className="text-[10px] text-[var(--color-text-secondary)]">{s.label}</p>
                        </div>
                        <p className={`text-sm font-bold ${s.textColor}`}>{formatLaunch(s.value.toString())}</p>
                        <p className="text-[10px] text-[var(--color-text-secondary)]">{pct(s.value).toFixed(1)}% от комиссии</p>
                      </div>
                    ))}
                  </div>

                  {/* Details row */}
                  <div className="border-t border-[var(--color-border)] pt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Рефералов выплачено" value={`${eco.axm.referralCount}`} sub={`${formatLaunch(eco.axm.referralPaid)} AXM`} />
                    <StatCard
                      label="Джекпот накоплен"
                      value={formatLaunch(eco.axm.jackpotContributed ?? '0')}
                      sub={`${eco.axm.jackpotContribBets ?? 0} ставок`}
                    />
                    <StatCard
                      label="Стейкинг (pending)"
                      value={formatLaunch(eco.axm.stakingPending ?? '0')}
                      sub={`отправлено: ${formatLaunch(eco.axm.stakingFlushed ?? '0')}`}
                      warn={BigInt(eco.axm.stakingPending ?? '0') > 0n}
                    />
                    <StatCard
                      label="Призы ивентов"
                      value={formatLaunch(eco.axm.eventPrizes)}
                      sub={`${eco.axm.eventWinners} победителей`}
                    />
                  </div>

                  {/* Team share card */}
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <div className={`rounded-xl border p-4 ${team >= 0n ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Доля команды</p>
                      <p className={`text-xl font-bold ${team >= 0n ? 'text-amber-400' : 'text-red-400'}`}>
                        {formatLaunch(team.toString())} AXM
                      </p>
                      <p className="text-[10px] text-[var(--color-text-secondary)] mb-1">{pct(team).toFixed(1)}% от комиссии</p>
                      {BigInt(eco.axm.teamWithdrawn ?? '0') > 0n && (
                        <p className="text-[10px] text-[var(--color-text-secondary)] mb-1">
                          Выведено ранее: {formatLaunch(eco.axm.teamWithdrawn ?? '0')} AXM ({eco.axm.teamWithdrawnCount ?? 0} оп.)
                        </p>
                      )}
                      {team > 0n && (
                        <ActionButton
                          onClick={async () => {
                            setWithdrawError(null);
                            setWithdrawResult(null);
                            try {
                              const result = await withdraw.mutateAsync(team.toString());
                              setWithdrawResult(result);
                            } catch (err) {
                              setWithdrawError(err instanceof Error ? err.message : 'Withdraw failed');
                            }
                          }}
                          disabled={withdraw.isPending}
                          variant="success"
                        >
                          {withdraw.isPending ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 size={12} className="animate-spin" />
                              Вывод...
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Wallet size={12} />
                              Вывести на кошелёк
                            </span>
                          )}
                        </ActionButton>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Withdraw result/error */}
      {withdrawResult && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-green-400 font-medium">Выведено {formatLaunch(withdrawResult.amount)} AXM на кошелёк казны</p>
            <p className="text-[var(--color-text-secondary)] font-mono mt-1">TX: {withdrawResult.txHash}</p>
          </div>
        </div>
      )}
      {withdrawError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{withdrawError}</p>
        </div>
      )}

      {/* ═══ Commission Breakdown (BPS) ═══ */}
      {bd && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <PieChart size={16} className="text-[var(--color-primary)]" />
            Распределение комиссии ({bd.commissionBps / 100}% от банка)
          </h3>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="flex h-6 overflow-hidden rounded-full">
              {bd.referralMaxBps > 0 && (
                <div className="bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(bd.referralMaxBps / bd.commissionBps) * 100}%` }}>
                  Реф {bd.referralMaxBps / 100}%
                </div>
              )}
              {bd.jackpotBps > 0 && (
                <div className="bg-purple-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(bd.jackpotBps / bd.commissionBps) * 100}%` }}>
                  ДП {bd.jackpotBps / 100}%
                </div>
              )}
              {bd.stakingBps > 0 && (
                <div className="bg-emerald-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(bd.stakingBps / bd.commissionBps) * 100}%` }}>
                  Стейкинг {bd.stakingBps / 100}%
                </div>
              )}
              {bd.partnerBps > 0 && (
                <div className="bg-teal-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(bd.partnerBps / bd.commissionBps) * 100}%` }}>
                  Партнёры {bd.partnerBps / 100}%
                </div>
              )}
              {bd.treasuryBps > 0 && (
                <div className="bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(bd.treasuryBps / bd.commissionBps) * 100}%` }}>
                  Казна {bd.treasuryBps / 100}%
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatCard label="Рефералы (макс)" value={`${bd.referralMaxBps} BPS`} sub={`${bd.referralMaxBps / 100}% от банка`} />
              <StatCard label="Джекпот" value={`${bd.jackpotBps} BPS`} sub={`${bd.jackpotBps / 100}% от банка`} />
              <StatCard label="Стейкинг LAUNCH" value={`${bd.stakingBps} BPS`} sub={`${bd.stakingBps / 100}% от банка`} />
              <StatCard label="Партнёры" value={`${bd.partnerBps} BPS`} sub={`${bd.partnerBps / 100}% от банка`} />
              <StatCard label="Казна" value={`${bd.treasuryBps} BPS`} sub={`${bd.treasuryBps / 100}% от банка`} />
            </div>

            {!breakdown?.valid && breakdown?.error && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {breakdown.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Staking Flush
   ═══════════════════════════════════════════════════════ */

export function StakingFlushSection() {
  const { data: stakingStats } = useAdminStakingStats();
  const { data: breakdown } = useAdminCommissionBreakdown();
  const flush = useAdminStakingFlush();
  const [flushResult, setFlushResult] = useState<{ txHash: string; amount: string } | null>(null);
  const [flushError, setFlushError] = useState<string | null>(null);

  const bd = breakdown?.breakdown;

  if (!stakingStats) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Send size={14} className="text-emerald-400" />
            Стейкинг LAUNCH — распределение AXM
          </h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            Накопленные 20% от комиссии &rarr; стейкинг-контракт &rarr; держателям LAUNCH
          </p>
        </div>
        <ActionButton
          onClick={async () => {
            setFlushError(null);
            setFlushResult(null);
            try {
              const result = await flush.mutateAsync();
              setFlushResult(result);
            } catch (err) {
              setFlushError(err instanceof Error ? err.message : 'Flush failed');
            }
          }}
          disabled={BigInt(stakingStats.pendingAmount) <= 0n || flush.isPending}
          variant="success"
        >
          {flush.isPending ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Отправка...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Send size={12} />
              Отправить {formatLaunch(stakingStats.pendingAmount)} AXM
            </span>
          )}
        </ActionButton>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Всего начислено" value={formatLaunch(stakingStats.totalAccumulated)} sub={`${stakingStats.totalEntries} ставок`} />
        <StatCard label="Ожидает отправки" value={formatLaunch(stakingStats.pendingAmount)} sub={`${stakingStats.pendingEntries} записей`} warn={BigInt(stakingStats.pendingAmount) > 0n} />
        <StatCard label="Отправлено" value={formatLaunch(stakingStats.flushedAmount)} sub={`${stakingStats.flushedEntries} записей`} />
        <StatCard label="Ставка" value={`${bd?.stakingBps ? bd.stakingBps / 100 : 2}%`} sub="от каждого банка" />
      </div>

      {flushResult && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-green-400 font-medium">Отправлено {formatLaunch(flushResult.amount)} AXM</p>
            <p className="text-[var(--color-text-secondary)] font-mono mt-1">TX: {flushResult.txHash}</p>
          </div>
        </div>
      )}
      {flushError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{flushError}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Referral Config
   ═══════════════════════════════════════════════════════ */

export function ReferralConfigSection() {
  const { data: allConfig } = useAdminConfig();
  const { data: breakdown } = useAdminCommissionBreakdown();
  const updateConfig = useAdminUpdateConfig();

  const [editingReferral, setEditingReferral] = useState(false);
  const [refL1, setRefL1] = useState('');
  const [refL2, setRefL2] = useState('');
  const [refL3, setRefL3] = useState('');
  const [refMax, setRefMax] = useState('');
  const [actionResult, setActionResult] = useState<string | null>(null);

  const bd = breakdown?.breakdown;

  const startEditReferral = () => {
    if (!allConfig) return;
    const get = (k: string, d: string) => allConfig.find((c) => c.key === k)?.value ?? d;
    setRefL1(get('REFERRAL_BPS_LEVEL_1', '300'));
    setRefL2(get('REFERRAL_BPS_LEVEL_2', '150'));
    setRefL3(get('REFERRAL_BPS_LEVEL_3', '50'));
    setRefMax(get('MAX_REFERRAL_BPS_PER_BET', '500'));
    setEditingReferral(true);
  };

  const saveReferral = async () => {
    setActionResult(null);
    try {
      for (const [key, val] of [
        ['REFERRAL_BPS_LEVEL_1', refL1],
        ['REFERRAL_BPS_LEVEL_2', refL2],
        ['REFERRAL_BPS_LEVEL_3', refL3],
        ['MAX_REFERRAL_BPS_PER_BET', refMax],
      ] as const) {
        await updateConfig.mutateAsync({ key, value: val });
      }
      setEditingReferral(false);
      setActionResult('Реферальный конфиг сохранён');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setActionResult(`Error: ${message}`);
    }
  };

  return (
    <div className="space-y-3">
      {actionResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${actionResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {actionResult}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Уровни рефералов</h3>
          {!editingReferral ? (
            <ActionButton onClick={startEditReferral}>Изменить</ActionButton>
          ) : (
            <div className="flex gap-2">
              <ActionButton onClick={() => setEditingReferral(false)} variant="danger">Отмена</ActionButton>
              <ActionButton onClick={saveReferral} variant="success" disabled={updateConfig.isPending}>Сохранить</ActionButton>
            </div>
          )}
        </div>

        {editingReferral ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 1 BPS</label>
              <input type="number" value={refL1} onChange={(e) => setRefL1(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 2 BPS</label>
              <input type="number" value={refL2} onChange={(e) => setRefL2(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 3 BPS</label>
              <input type="number" value={refL3} onChange={(e) => setRefL3(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Макс. кап BPS</label>
              <input type="number" value={refMax} onChange={(e) => setRefMax(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {bd && (
              <>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 1</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_1')?.value ?? '300'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 2</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_2')?.value ?? '150'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 3</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_3')?.value ?? '50'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Макс. кап</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'MAX_REFERRAL_BPS_PER_BET')?.value ?? '500'} BPS</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Section: Partners Management
   ═══════════════════════════════════════════════════════ */

export function PartnersSection() {
  const { data: partners, isLoading } = useAdminPartners();
  const partnerPayout = useAdminPartnerPayout();
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [payoutResults, setPayoutResults] = useState<PartnerPayoutResult[] | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Партнёрская казна</h3>
        <div className="flex gap-2">
          {partners && partners.some(p => BigInt(p.unpaidAmount) > 0n) && (
            <ActionButton
              onClick={async () => {
                setPayoutError(null);
                setPayoutResults(null);
                try {
                  const result = await partnerPayout.mutateAsync();
                  setPayoutResults(result.results);
                } catch (err) {
                  setPayoutError(err instanceof Error ? err.message : 'Payout failed');
                }
              }}
              disabled={partnerPayout.isPending}
              variant="success"
            >
              {partnerPayout.isPending ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Выплата...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Banknote size={12} />
                  Начислить зарплату
                </span>
              )}
            </ActionButton>
          )}
          <ActionButton onClick={() => setShowAddForm(!showAddForm)}>
            <span className="flex items-center gap-1">
              <Plus size={12} />
              Добавить
            </span>
          </ActionButton>
        </div>
      </div>

      {/* Payout results */}
      {payoutResults && payoutResults.length > 0 && (
        <div className="space-y-2">
          {payoutResults.map((r) => (
            <div
              key={r.partnerId}
              className={`flex items-start gap-2 p-3 rounded-lg border ${
                r.txHash ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              {r.txHash ? (
                <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs min-w-0">
                <p className={r.txHash ? 'text-green-400' : 'text-red-400'}>
                  <span className="font-medium">{r.name}</span> — {formatLaunch(r.amount)} AXM
                  {r.txHash && <span className="text-[var(--color-text-secondary)]"> &rarr; {shortAddr(r.address)}</span>}
                </p>
                {r.txHash && <p className="text-[var(--color-text-secondary)] font-mono truncate">TX: {r.txHash}</p>}
                {r.error && <p className="text-red-400">{r.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {payoutError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{payoutError}</p>
        </div>
      )}

      {actionResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${actionResult.startsWith('Ошибка') || actionResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {actionResult}
        </div>
      )}

      {showAddForm && (
        <AddPartnerForm
          onSuccess={() => { setShowAddForm(false); setActionResult('Партнёр добавлен'); }}
          onError={(msg) => setActionResult(`Ошибка: ${msg}`)}
        />
      )}

      {partners && partners.length > 0 ? (
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Имя</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Адрес</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">BPS</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Статус</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Невыплачено</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Всего (AXM)</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <PartnerRow key={p.id} partner={p} onResult={setActionResult} />
              ))}
            </tbody>
          </table>
        </TableWrapper>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">Партнёры не настроены</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Combined CommissionTab (backwards compat)
   ═══════════════════════════════════════════════════════ */

export function CommissionTab() {
  return (
    <div className="space-y-6">
      <CommissionBreakdownSection />
      <StakingFlushSection />
      <ReferralConfigSection />
      <PartnersSection />
    </div>
  );
}

/* ─── Helper Components ──────────────────────────────── */

function AddPartnerForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const addPartner = useAdminAddPartner();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [bps, setBps] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !address.trim() || !bps) return;
    try {
      await addPartner.mutateAsync({ name: name.trim(), address: address.trim(), bps: Number(bps) });
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onError(message);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Имя</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя партнёра" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Адрес кошелька</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="axm1..." className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-mono focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">BPS (basis points)</label>
          <input type="number" value={bps} onChange={(e) => setBps(e.target.value)} placeholder="100" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
      </div>
      <ActionButton onClick={handleSubmit} variant="success" disabled={addPartner.isPending || !name.trim() || !address.trim()}>
        {addPartner.isPending ? 'Добавление...' : 'Добавить партнёра'}
      </ActionButton>
    </div>
  );
}

function PartnerRow({ partner, onResult }: { partner: AdminPartner; onResult: (msg: string) => void }) {
  const updatePartner = useAdminUpdatePartner();
  const deletePartner = useAdminDeletePartner();
  const [editBps, setEditBps] = useState(String(partner.bps));
  const [editing, setEditing] = useState(false);

  const handleSave = async () => {
    try {
      await updatePartner.mutateAsync({ id: partner.id, bps: Number(editBps) });
      setEditing(false);
      onResult('Партнёр обновлён');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${message}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePartner.mutateAsync(partner.id);
      onResult('Партнёр деактивирован');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${message}`);
    }
  };

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0">
      <td className="px-3 py-2 font-medium">{partner.name}</td>
      <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{shortAddr(partner.address)}</td>
      <td className="px-3 py-2 text-center">
        {editing ? (
          <input type="number" value={editBps} onChange={(e) => setEditBps(e.target.value)} className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-xs text-center" />
        ) : (
          <span className="tabular-nums">{partner.bps}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${partner.isActive === 1 ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'}`}>
          {partner.isActive === 1 ? 'Активен' : 'Неактивен'}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {BigInt(partner.unpaidAmount) > 0n ? (
          <span className="text-amber-400 font-bold">{formatLaunch(partner.unpaidAmount)}</span>
        ) : (
          <span className="text-[var(--color-text-secondary)]">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatLaunch(partner.totalEarned)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <ActionButton onClick={() => setEditing(false)} variant="danger">Отмена</ActionButton>
              <ActionButton onClick={handleSave} variant="success" disabled={updatePartner.isPending}>Сохранить</ActionButton>
            </>
          ) : (
            <>
              <ActionButton onClick={() => setEditing(true)}>Изменить</ActionButton>
              {partner.isActive === 1 && (
                <ActionButton onClick={handleDelete} variant="danger" disabled={deletePartner.isPending}>
                  <Trash2 size={12} />
                </ActionButton>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
