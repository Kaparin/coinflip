'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ArrowDown, ArrowUp, Gift, RefreshCw, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useWalletContext } from '@/contexts/wallet-context';
import { EXPLORER_URL } from '@/lib/constants';
import {
  fetchStakingStats,
  fetchUserStaking,
  signStake,
  signUnstake,
  signClaim,
  formatNumber,
  STAKING_CONTRACT,
  type StakingStats,
  type UserStakingInfo,
} from '@/lib/staking';
import { useTranslation } from '@/lib/i18n';

type TabMode = 'stake' | 'unstake';
type TxStatus = 'idle' | 'signing' | 'success' | 'error';

interface StakingSheetProps {
  open: boolean;
  onClose: () => void;
}

export function StakingSheet({ open, onClose }: StakingSheetProps) {
  const { t } = useTranslation();
  const { address, isConnected, getWallet } = useWalletContext();
  const [stats, setStats] = useState<StakingStats | null>(null);
  const [user, setUser] = useState<UserStakingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>('stake');
  const [amount, setAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txMessage, setTxMessage] = useState('');

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

  // Refresh when opened
  useEffect(() => {
    if (!open || !isConnected) return;
    setIsLoading(true);
    refresh();
  }, [open, isConnected, refresh]);

  const handleStake = async () => {
    const wallet = getWallet();
    if (!wallet || !address || !amount) return;
    const num = parseFloat(amount);
    if (num <= 0 || (user && num > user.launchBalance)) return;

    setTxStatus('signing');
    setTxMessage('');
    try {
      const result = await signStake(wallet, address, num);
      setTxStatus('success');
      setTxMessage(`TX: ${result.txHash.slice(0, 16)}...`);
      setAmount('');
      setTimeout(refresh, 3000);
    } catch (err) {
      setTxStatus('error');
      setTxMessage(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  const handleUnstake = async () => {
    const wallet = getWallet();
    if (!wallet || !address || !amount) return;
    const num = parseFloat(amount);
    if (num <= 0 || (user && num > user.staked)) return;

    setTxStatus('signing');
    setTxMessage('');
    try {
      const result = await signUnstake(wallet, address, num);
      setTxStatus('success');
      setTxMessage(`TX: ${result.txHash.slice(0, 16)}...`);
      setAmount('');
      setTimeout(refresh, 3000);
    } catch (err) {
      setTxStatus('error');
      setTxMessage(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  const handleClaim = async () => {
    const wallet = getWallet();
    if (!wallet || !address) return;

    setTxStatus('signing');
    setTxMessage('');
    try {
      const result = await signClaim(wallet, address);
      setTxStatus('success');
      setTxMessage(`TX: ${result.txHash.slice(0, 16)}...`);
      setTimeout(refresh, 3000);
    } catch (err) {
      setTxStatus('error');
      setTxMessage(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  const handleMax = () => {
    if (!user) return;
    setAmount(
      activeTab === 'stake'
        ? user.launchBalance.toString()
        : user.staked.toString(),
    );
  };

  const maxAmount = activeTab === 'stake' ? user?.launchBalance ?? 0 : user?.staked ?? 0;
  const canSubmit = amount && parseFloat(amount) > 0 && parseFloat(amount) <= maxAmount && txStatus !== 'signing';

  return (
    <Modal open={open} onClose={onClose} title={t('staking.title')} showCloseButton={txStatus !== 'signing'}>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : !stats ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">{t('staking.subtitle')}</p>
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
          {/* Global Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-center">
              <p className="text-lg font-bold">{formatNumber(stats.totalStaked)}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">{t('staking.totalStaked')}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{formatNumber(stats.totalDistributed)}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">{t('staking.distributed')}</p>
            </div>
          </div>

          {/* User Position */}
          {user && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  {t('staking.yourPosition')}
                </p>
                <div className="flex items-center gap-2">
                  {user.pendingRewards > 0 && (
                    <button
                      type="button"
                      onClick={handleClaim}
                      disabled={txStatus === 'signing'}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                    >
                      <Gift size={12} />
                      {t('staking.claim')} {formatNumber(user.pendingRewards, 4)} AXM
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setIsLoading(true); refresh(); }}
                    className="rounded-lg p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30 transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">{t('staking.staked')}</p>
                  <p className="text-sm font-bold">{formatNumber(user.staked, 0)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">LAUNCH</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">{t('staking.rewards')}</p>
                  <p className="text-sm font-bold text-emerald-400">{formatNumber(user.pendingRewards, 4)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">AXM</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">{t('staking.claimed')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-secondary)]">{formatNumber(user.totalClaimed, 4)}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">AXM</p>
                </div>
              </div>
            </div>
          )}

          {/* Stake / Unstake Tabs */}
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="flex">
              <button
                type="button"
                onClick={() => { setActiveTab('stake'); setAmount(''); setTxStatus('idle'); setTxMessage(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors border-b-2 ${
                  activeTab === 'stake'
                    ? 'text-violet-400 border-violet-400 bg-violet-500/5'
                    : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text)]'
                }`}
              >
                <ArrowDown size={14} />
                {t('staking.stake')}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('unstake'); setAmount(''); setTxStatus('idle'); setTxMessage(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors border-b-2 ${
                  activeTab === 'unstake'
                    ? 'text-rose-400 border-rose-400 bg-rose-500/5'
                    : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text)]'
                }`}
              >
                <ArrowUp size={14} />
                {t('staking.unstake')}
              </button>
            </div>

            <div className="px-3 py-3 space-y-3">
              {/* Balance label */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[var(--color-text-secondary)]">
                  {activeTab === 'stake' ? t('staking.amountToStake') : t('staking.amountToUnstake')}
                </label>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {activeTab === 'stake'
                    ? `${t('staking.balance')}: ${user ? formatNumber(user.launchBalance, 0) : '—'} LAUNCH`
                    : `${t('staking.staked')}: ${user ? formatNumber(user.staked, 0) : '—'} LAUNCH`}
                </span>
              </div>

              {/* Input */}
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 pr-16 text-lg placeholder-[var(--color-text-secondary)]/30 focus:border-violet-500/50 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleMax}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-violet-500/15 px-2 py-1 text-[10px] font-bold text-violet-400 hover:bg-violet-500/25 transition-colors"
                >
                  MAX
                </button>
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={activeTab === 'stake' ? handleStake : handleUnstake}
                disabled={!canSubmit}
                className={`w-full rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === 'stake'
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {txStatus === 'signing' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {t('staking.signing')}
                  </span>
                ) : activeTab === 'stake' ? (
                  t('staking.stakeLaunch')
                ) : (
                  t('staking.unstakeLaunch')
                )}
              </button>

              {/* TX Result */}
              {txStatus === 'success' && txMessage && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-400">
                  {txMessage}
                </div>
              )}
              {txStatus === 'error' && txMessage && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-400">
                  {txMessage}
                </div>
              )}
            </div>
          </div>

          {/* Revenue info */}
          <div className="flex items-center justify-between text-[11px] px-1">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[var(--color-text-secondary)]">{t('staking.revenueSource')}</span>
            </div>
            <span className="font-bold">2% {t('staking.perPot')}</span>
          </div>

          {/* Contract link */}
          {STAKING_CONTRACT && (
            <div className="text-center">
              <a
                href={`${EXPLORER_URL}/contract/${STAKING_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-mono text-violet-400/50 hover:text-violet-400 transition-colors"
              >
                {STAKING_CONTRACT.slice(0, 12)}...{STAKING_CONTRACT.slice(-6)}
                <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
