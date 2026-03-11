'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  Coins,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useWalletContext } from '@/contexts/wallet-context';
import { EXPLORER_URL } from '@/lib/constants';
import { useToast } from '@/components/ui/toast';
import {
  fetchStakingStats,
  fetchUserStaking,
  signStake,
  signUnstake,
  signClaim,
  formatNumber,
  STAKING_CONTRACT,
  StakingError,
  type StakingStats,
  type UserStakingInfo,
} from '@/lib/staking';
import { useTranslation } from '@/lib/i18n';
import { useStakingStore, type OpType } from '@/stores/staking-store';

type TabMode = 'stake' | 'unstake';

interface StakingSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Human-friendly error message from StakingError code */
function getErrorMessage(err: unknown, t: (key: string) => string): { message: string; code?: string } {
  if (err instanceof StakingError) {
    const fallback = t('staking.errorUnknown');
    const messages: Record<string, string> = {
      network: t('staking.errorNetwork'),
      insufficient_funds: t('staking.errorInsufficientFunds'),
      insufficient_gas: t('staking.errorInsufficientGas'),
      not_staked: t('staking.errorNotStaked'),
      no_rewards: t('staking.errorNoRewards'),
      rejected: t('staking.errorRejected'),
      timeout: t('staking.errorTimeout'),
      signing_failed: t('staking.errorSigningFailed'),
      unknown: fallback,
    };
    return {
      message: (err.code in messages ? messages[err.code] : fallback) as string,
      code: err.code,
    };
  }
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('rejected')) {
      return { message: t('staking.errorRejected'), code: 'rejected' };
    }
    return { message: t('staking.errorUnknown'), code: 'unknown' };
  }
  return { message: t('staking.errorUnknown'), code: 'unknown' };
}

export function StakingSheet({ open, onClose }: StakingSheetProps) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { address, isConnected, getWallet } = useWalletContext();
  const store = useStakingStore();

  const [stats, setStats] = useState<StakingStats | null>(null);
  const [user, setUser] = useState<UserStakingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>('stake');
  const [amount, setAmount] = useState('');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---- Data fetching ----

  const refresh = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([
        fetchStakingStats(),
        address ? fetchUserStaking(address) : null,
      ]);
      setStats(s);
      if (u) setUser(u);
    } catch {
      /* contract may not be deployed yet */
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!open || !isConnected) return;
    setIsLoading(true);
    refresh();
  }, [open, isConnected, refresh]);

  // Auto-refresh while there are pending txs; expire after 30s
  useEffect(() => {
    if (store.pendingTxs.length === 0) return;
    const interval = setInterval(() => {
      refresh();
      store.expirePendingTxs();
    }, 5_000);
    return () => clearInterval(interval);
  }, [store.pendingTxs.length, refresh, store]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // ---- Optimistic update ----

  const applyOptimistic = (type: OpType, amt?: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      if (type === 'claim') return { ...prev, pendingRewards: 0 };
      if (type === 'stake' && amt) {
        return { ...prev, launchBalance: Math.max(0, prev.launchBalance - amt), staked: prev.staked + amt };
      }
      if (type === 'unstake' && amt) {
        return { ...prev, staked: Math.max(0, prev.staked - amt), launchBalance: prev.launchBalance + amt };
      }
      return prev;
    });
  };

  // ---- Derived state ----

  const maxAmount = activeTab === 'stake' ? (user?.launchBalance ?? 0) : (user?.staked ?? 0);
  const opPhase = store.op?.phase;
  const isBlocked = store.isLocked || opPhase === 'confirming';
  const canSubmit = !isBlocked && !!amount && parseFloat(amount) > 0 && parseFloat(amount) <= maxAmount;
  const canClaim = !isBlocked && !!user && user.pendingRewards > 0;

  // ---- Execute staking operation ----

  const execute = async (type: OpType, amt?: number) => {
    const wallet = getWallet();
    if (!wallet || !address || store.isLocked) return;

    store.startOp(type, amt);

    try {
      const onPhase = (phase: 'signing' | 'broadcasting') => store.setPhase(phase);

      let result: { txHash: string };
      if (type === 'stake') {
        result = await signStake(wallet, address, amt!, onPhase);
      } else if (type === 'unstake') {
        result = await signUnstake(wallet, address, amt!, onPhase);
      } else {
        result = await signClaim(wallet, address, onPhase);
      }

      store.setTxHash(result.txHash);
      store.setDone();
      setAmount('');
      applyOptimistic(type, amt);

      const label =
        type === 'stake' ? t('staking.stake') :
        type === 'unstake' ? t('staking.unstake') :
        t('staking.claim');
      addToast('success', `${label} — ${t('staking.txSubmitted')}`);

      // Refresh from chain after a few seconds
      refreshTimerRef.current = setTimeout(refresh, 5_000);
    } catch (err) {
      const { message, code } = getErrorMessage(err, t);
      store.setError(message, code);

      // If user rejected, auto-clear quickly
      if (code === 'rejected') {
        setTimeout(() => store.clearOp(), 3_000);
      }
    }
  };

  const handleStake = () => {
    if (isBlocked) return;
    const num = parseFloat(amount);
    if (!num || num <= 0 || (user && num > user.launchBalance)) return;
    execute('stake', num);
  };

  const handleUnstake = () => {
    if (isBlocked) return;
    const num = parseFloat(amount);
    if (!num || num <= 0 || (user && num > user.staked)) return;
    execute('unstake', num);
  };

  const handleClaim = () => {
    if (isBlocked) return;
    if (!user || user.pendingRewards <= 0) return;
    execute('claim');
  };

  const setPercent = (pct: number) => {
    if (maxAmount <= 0) return;
    const val = maxAmount * pct;
    setAmount(pct === 1 ? maxAmount.toString() : Math.floor(val).toString());
  };

  // Allow closing modal unless in signing/broadcasting phase
  const canClose = !store.isLocked;

  return (
    <Modal open={open} onClose={onClose} title={t('staking.title')} showCloseButton={canClose}>
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-violet-400" />
        </div>
      ) : !stats ? (
        <div className="text-center py-10">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
            <Coins size={24} className="text-violet-400" />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-1">{t('staking.subtitle')}</p>
          <p className="text-xs text-[var(--color-text-secondary)]/60 mb-4">
            {t('staking.contractUnavailable')}
          </p>
          <button type="button" onClick={() => { setIsLoading(true); refresh(); }}
            className="text-xs text-violet-400 hover:underline">
            {t('staking.retry')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ═══ Operation Status Banner ═══ */}
          <OperationBanner store={store} t={t} />

          {/* ═══ Pending Txs (chain confirmation) ═══ */}
          {store.pendingTxs.length > 0 && (
            <div className="space-y-1.5">
              {store.pendingTxs.map((tx) => (
                <div key={tx.txHash} className="flex items-center gap-2 rounded-xl bg-violet-500/8 border border-violet-500/15 px-3 py-2">
                  <Loader2 size={12} className="animate-spin text-violet-400 shrink-0" />
                  <span className="text-[11px] text-violet-300 flex-1 truncate">
                    {tx.type === 'stake' && `${t('staking.stake')} ${tx.amount} LAUNCH`}
                    {tx.type === 'unstake' && `${t('staking.unstake')} ${tx.amount} LAUNCH`}
                    {tx.type === 'claim' && t('staking.claim')}
                    {' — '}{t('staking.confirming')}
                  </span>
                  <a href={`${EXPLORER_URL}/transactions/${tx.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-violet-400/40 hover:text-violet-400 shrink-0">
                    <ExternalLink size={11} />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Rewards Card ═══ */}
          {user && user.pendingRewards > 0 ? (
            <div className="relative overflow-hidden rounded-2xl p-[1px]">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/40 via-teal-500/20 to-emerald-500/5" />
              <div className="relative rounded-2xl bg-[var(--color-bg)]/95 backdrop-blur-sm px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-0.5">{t('staking.pendingRewards')}</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatNumber(user.pendingRewards, 4)}</p>
                      <p className="text-xs text-emerald-400/60 font-medium">AXM</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={!canClaim}
                    className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                  >
                    {store.op?.type === 'claim' && store.isLocked ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      t('staking.claimRewards')
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : user ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-center">
              <p className="text-xs text-[var(--color-text-secondary)]">{t('staking.noRewards')}</p>
            </div>
          ) : null}

          {/* ═══ Your Position ═══ */}
          {user && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  {t('staking.yourPosition')}
                </p>
                <button type="button" onClick={() => { setIsLoading(true); refresh(); }}
                  className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30 transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] px-1 pb-3">
                <div className="text-center px-2">
                  <p className="text-lg font-bold tabular-nums">{formatNumber(user.staked, 0)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">LAUNCH {t('staking.staked').toLowerCase()}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatNumber(user.pendingRewards, 4)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">AXM {t('staking.rewards').toLowerCase()}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-lg font-bold text-[var(--color-text-secondary)] tabular-nums">{formatNumber(user.totalClaimed, 4)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">AXM {t('staking.claimed').toLowerCase()}</p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Stake / Unstake ═══ */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
            {/* Tab Pills */}
            <div className="flex gap-1 p-1.5 bg-[var(--color-surface)]">
              <button
                type="button"
                onClick={() => { setActiveTab('stake'); setAmount(''); }}
                disabled={isBlocked}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${
                  activeTab === 'stake'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/25'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
              >
                {t('staking.stake')}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('unstake'); setAmount(''); }}
                disabled={isBlocked}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${
                  activeTab === 'unstake'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-500/25'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
              >
                {t('staking.unstake')}
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Balance */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {activeTab === 'stake' ? t('staking.availableToStake') : t('staking.stakedAmount')}
                </span>
                <span className="text-[11px] font-bold tabular-nums">
                  {user ? formatNumber(maxAmount, 0) : '—'} LAUNCH
                </span>
              </div>

              {/* Input */}
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  disabled={isBlocked}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 pr-16 text-xl font-bold placeholder-[var(--color-text-secondary)]/20 focus:border-violet-500/50 focus:outline-none transition-colors tabular-nums disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setPercent(1)}
                  disabled={isBlocked}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-violet-500/15 px-2.5 py-1 text-[10px] font-bold text-violet-400 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
                >
                  MAX
                </button>
              </div>

              {/* Percent Buttons */}
              <div className="flex gap-2">
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercent(pct)}
                    disabled={isBlocked}
                    className="flex-1 py-1.5 rounded-lg border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-secondary)] hover:border-violet-500/40 hover:text-violet-400 transition-colors disabled:opacity-50"
                  >
                    {pct === 1 ? 'MAX' : `${pct * 100}%`}
                  </button>
                ))}
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={activeTab === 'stake' ? handleStake : handleUnstake}
                disabled={!canSubmit}
                className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  activeTab === 'stake'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-500/20'
                }`}
              >
                {store.op && store.isLocked && store.op.type === activeTab ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {store.op.phase === 'signing' ? t('staking.phaseSigning') : t('staking.phaseBroadcasting')}
                  </span>
                ) : activeTab === 'stake' ? (
                  t('staking.stakeLaunch')
                ) : (
                  t('staking.unstakeLaunch')
                )}
              </button>
            </div>
          </div>

          {/* ═══ Protocol Stats ═══ */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Coins size={10} className="text-violet-400" />
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)]">{t('staking.totalStaked')}</p>
              </div>
              <p className="text-sm font-bold tabular-nums">{formatNumber(stats.totalStaked)}</p>
              <p className="text-[9px] text-[var(--color-text-secondary)]">LAUNCH</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp size={10} className="text-emerald-400" />
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)]">{t('staking.distributed')}</p>
              </div>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatNumber(stats.totalDistributed)}</p>
              <p className="text-[9px] text-[var(--color-text-secondary)]">AXM</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users size={10} className="text-blue-400" />
                <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)]">{t('staking.stakers')}</p>
              </div>
              <p className="text-sm font-bold tabular-nums">{stats.totalStakers}</p>
            </div>
          </div>

          {/* Revenue + Contract */}
          <div className="flex items-center justify-between text-[10px] px-1">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[var(--color-text-secondary)]">{t('staking.revenueSource')}: 20% {t('staking.ofCommission')}</span>
            </div>
            {STAKING_CONTRACT && (
              <a
                href={`${EXPLORER_URL}/contract/${STAKING_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-violet-400/40 hover:text-violet-400 transition-colors"
              >
                {STAKING_CONTRACT.slice(0, 8)}...{STAKING_CONTRACT.slice(-4)}
                <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══ Operation Status Banner ═══

function OperationBanner({
  store,
  t,
}: {
  store: ReturnType<typeof useStakingStore>;
  t: (key: string) => string;
}) {
  const { op } = store;
  if (!op) return null;

  const typeLabel =
    op.type === 'stake' ? t('staking.stake') :
    op.type === 'unstake' ? t('staking.unstake') :
    t('staking.claim');

  // Signing / Broadcasting — active operation
  if (op.phase === 'signing' || op.phase === 'broadcasting') {
    const elapsed = Math.floor((Date.now() - op.startedAt) / 1000);
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-violet-500/8 border border-violet-500/20 px-4 py-3 animate-pulse">
        <Loader2 size={18} className="animate-spin text-violet-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-violet-300">
            {typeLabel}{op.amount ? ` ${op.amount} LAUNCH` : ''}
          </p>
          <p className="text-[10px] text-violet-400/60">
            {op.phase === 'signing' ? t('staking.phaseSigning') : t('staking.phaseBroadcasting')}
            {elapsed > 3 ? ` · ${elapsed}s` : ''}
          </p>
        </div>
      </div>
    );
  }

  // Done — success
  if (op.phase === 'done' && op.txHash) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3">
        <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-emerald-300">
            {typeLabel} — {t('staking.successSent')}
          </p>
          <a
            href={`${EXPLORER_URL}/transactions/${op.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-emerald-400/50 hover:text-emerald-400 flex items-center gap-1 transition-colors"
          >
            {op.txHash.slice(0, 12)}...
            <ExternalLink size={9} />
          </a>
        </div>
        <button
          type="button"
          onClick={() => store.clearOp()}
          className="rounded-lg p-1.5 text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Error
  if (op.phase === 'error') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-red-500/8 border border-red-500/20 px-4 py-3">
        <AlertCircle size={18} className="text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-red-300">
            {typeLabel} — {t('staking.errorLabel')}
          </p>
          <p className="text-[10px] text-red-400/70">{op.error}</p>
        </div>
        <button
          type="button"
          onClick={() => store.clearOp()}
          className="rounded-lg p-1.5 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
