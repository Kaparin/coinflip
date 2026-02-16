'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, Loader2, Shield } from 'lucide-react';
import { useGetVaultBalance, useWithdrawFromVault } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/components/ui/modal';
import { LaunchTokenIcon } from '@/components/ui';
import { fromMicroLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { signDeposit } from '@/lib/wallet-signer';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { useTranslation } from '@/lib/i18n';

/** Deposit presets in human-readable LAUNCH */
const DEPOSIT_PRESETS = [100, 500, 1000];
const DEPOSIT_PRESET_LABELS = ['100', '500', '1K'];

type DepositStep = 'connecting' | 'signing' | 'broadcasting' | 'confirming';

const DEPOSIT_STEPS: DepositStep[] = ['connecting', 'signing', 'broadcasting', 'confirming'];

function DepositProgressOverlay({ currentStep, elapsedSec }: { currentStep: DepositStep; elapsedSec: number }) {
  const { t } = useTranslation();
  const stepLabels: Record<DepositStep, string> = {
    connecting: t('balance.depositStep1'),
    signing: t('balance.depositStep2'),
    broadcasting: t('balance.depositStep3'),
    confirming: t('balance.depositStep4'),
  };
  const currentIdx = DEPOSIT_STEPS.indexOf(currentStep);

  return (
    <div className="py-2 space-y-5">
      {/* Animated spinner */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin" />
          <LaunchTokenIcon size={24} />
        </div>
        <h3 className="text-base font-bold">{t('balance.depositInProgress')}</h3>
      </div>

      {/* Step list */}
      <div className="space-y-2.5">
        {DEPOSIT_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          const isPending = idx > currentIdx;

          return (
            <div key={step} className="flex items-center gap-3">
              {/* Step indicator */}
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                isDone ? 'bg-[var(--color-success)] text-white'
                  : isActive ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-border)]/30 text-[var(--color-text-secondary)]'
              }`}>
                {isDone ? (
                  <CheckCircle size={14} />
                ) : isActive ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  idx + 1
                )}
              </div>
              {/* Label */}
              <span className={`text-sm transition-colors duration-300 ${
                isDone ? 'text-[var(--color-success)] font-medium'
                  : isActive ? 'text-[var(--color-text)] font-semibold'
                  : 'text-[var(--color-text-secondary)]'
              }`}>
                {stepLabels[step]}
                {isActive && <span className="inline-block ml-1 animate-pulse">...</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Warning + timer */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <Shield size={14} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t('balance.depositDoNotClose')}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {t('balance.depositEstimate')} · {elapsedSec}s
          </p>
        </div>
      </div>
    </div>
  );
}

export function BalanceDisplay() {
  const { t } = useTranslation();
  const { isConnected, isConnecting, address, getWallet, connect } = useWalletContext();
  const { pendingDeduction, isFrozen } = usePendingBalance();
  const { data, isLoading, refetch } = useGetVaultBalance({
    query: {
      enabled: isConnected,
      refetchInterval: isFrozen ? false : 15_000, // Pause refetch while deductions pending
    },
  });
  const { data: walletBalanceRaw } = useWalletBalance(address);
  const queryClient = useQueryClient();

  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [depositStatus, setDepositStatus] = useState<'idle' | 'signing' | 'broadcasting' | 'success' | 'error'>('idle');
  const [depositStep, setDepositStep] = useState<DepositStep>('connecting');
  const [depositError, setDepositError] = useState('');
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositElapsed, setDepositElapsed] = useState(0);
  const depositTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [withdrawStatus, setWithdrawStatus] = useState<'idle' | 'success'>('idle');

  const withdrawMutation = useWithdrawFromVault({
    mutation: {
      onSuccess: (response) => {
        const txHash = (response as any)?.tx_hash ?? '';
        setWithdrawStatus('success');
        // Immediately invalidate balance queries
        queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
        // Also refetch after a short delay for blockchain propagation
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
          queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
        }, 3000);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
          queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
        }, 8000);
      },
    },
  });

  const balance = data?.data;
  const rawAvailableMicro = BigInt(balance?.available ?? '0');
  const rawLockedMicro = BigInt(balance?.locked ?? '0');

  // Apply pending deductions: subtract from available, add to locked
  const availableMicro = rawAvailableMicro - pendingDeduction < 0n ? 0n : rawAvailableMicro - pendingDeduction;
  const lockedMicro = rawLockedMicro + pendingDeduction;
  const totalMicro = availableMicro + lockedMicro;

  const availableHuman = fromMicroLaunch(availableMicro);
  const lockedHuman = fromMicroLaunch(lockedMicro);
  const totalHuman = fromMicroLaunch(totalMicro);

  // Wallet (CW20) balance - tokens not yet deposited
  const walletBalanceHuman = fromMicroLaunch(walletBalanceRaw ?? '0');

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  // Elapsed time counter for deposit progress
  useEffect(() => {
    if (depositStatus === 'signing' || depositStatus === 'broadcasting') {
      setDepositElapsed(0);
      depositTimerRef.current = setInterval(() => {
        setDepositElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (depositTimerRef.current) {
        clearInterval(depositTimerRef.current);
        depositTimerRef.current = null;
      }
    }
    return () => {
      if (depositTimerRef.current) clearInterval(depositTimerRef.current);
    };
  }, [depositStatus]);

  // --- Deposit via Web Wallet (client-side signing) ---
  const handleDeposit = useCallback(async () => {
    if (!address || !depositAmount) return;
    const parsedHuman = parseFloat(depositAmount);
    if (isNaN(parsedHuman) || parsedHuman <= 0) return;

    const wallet = getWallet();
    if (!wallet) {
      setDepositError(t('balance.walletNotUnlocked'));
      setDepositStatus('error');
      return;
    }

    try {
      setDepositStatus('signing');
      setDepositStep('connecting');
      setDepositError('');

      // Simulate sub-step progression: connecting → signing → broadcasting → confirming
      // signDeposit does: connect to RPC → sign → broadcast → wait for inclusion
      setDepositStep('signing');

      // Small delay to show "signing" step before the actual heavy operation
      await new Promise((r) => setTimeout(r, 300));
      setDepositStep('broadcasting');

      const result = await signDeposit(wallet, address, parsedHuman);

      setDepositStep('confirming');
      // Brief pause to show confirming step
      await new Promise((r) => setTimeout(r, 800));

      setDepositTxHash(result.txHash);
      setDepositStatus('success');

      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
      }, 3000);
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : t('balance.depositFailed'));
      setDepositStatus('error');
    }
  }, [address, depositAmount, getWallet, refetch, queryClient, t]);

  const resetDeposit = () => {
    setShowDeposit(false);
    setDepositAmount('');
    setDepositStatus('idle');
    setDepositStep('connecting');
    setDepositError('');
    setDepositTxHash('');
    setDepositElapsed(0);
  };

  const handleWithdraw = () => {
    const parsedHuman = parseFloat(withdrawAmount);
    if (isNaN(parsedHuman) || parsedHuman <= 0 || parsedHuman > availableHuman) return;
    const microAmount = toMicroLaunch(parsedHuman);
    withdrawMutation.mutate({ data: { amount: microAmount } });
  };

  if (!isConnected && !isConnecting) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">{t('balance.connectToPlay')}</p>
        <button type="button" onClick={connect}
          className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold hover:bg-[var(--color-primary-hover)]">
          {t('common.connectWallet')}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {isLoading ? (
          <div className="grid gap-2 grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Wallet balance (CW20 tokens in user's wallet, not deposited) */}
            {walletBalanceHuman > 0 && (
              <div className="rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.walletBalance')}</p>
                    <p className="flex items-center gap-1.5 text-sm font-bold tabular-nums">{fmtNum(walletBalanceHuman)} <LaunchTokenIcon size={18} /></p>
                  </div>
                  <button type="button" onClick={() => { setDepositAmount(String(Math.floor(walletBalanceHuman))); setShowDeposit(true); }}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]">
                    {t('balance.depositAll')}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">{t('balance.depositToPlay')}</p>
              </div>
            )}

            {/* Vault balance (deposited in contract) */}
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-1.5 font-medium tracking-wide">{t('balance.gameVault')}</p>
            <div className="grid gap-2 grid-cols-3 mb-3">
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.available')}</p>
                <p className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-[var(--color-success)]">{fmtNum(availableHuman)} <LaunchTokenIcon size={18} /></p>
              </div>
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.inBets')}</p>
                <p className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-[var(--color-warning)]">{fmtNum(lockedHuman)} <LaunchTokenIcon size={18} /></p>
              </div>
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.total')}</p>
                <p className="flex items-center gap-1.5 text-lg font-bold tabular-nums">{fmtNum(totalHuman)} <LaunchTokenIcon size={18} /></p>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDeposit(true)}
                className="flex-1 rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-xs font-bold transition-colors hover:bg-[var(--color-primary-hover)] btn-press">
                {t('balance.depositBtn')}
              </button>
              <button type="button" onClick={() => setShowWithdraw(true)} disabled={availableMicro <= 0n}
                className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 btn-press">
                {t('common.withdraw')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== Deposit Modal ===== */}
      {showDeposit && (
        <Modal open onClose={depositStatus === 'signing' || depositStatus === 'broadcasting' ? () => {} : resetDeposit}>
          <div className="p-5 max-w-sm w-full">
            {depositStatus === 'success' ? (
              <div className="text-center py-4 animate-fade-up">
                <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--color-success)]/15 animate-bounce-in mb-3">
                  <CheckCircle size={28} className="text-[var(--color-success)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">{t('balance.depositSuccess')}</h3>
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold mb-1 text-[var(--color-success)] animate-number-pop">
                  +{parseFloat(depositAmount).toLocaleString()} <LaunchTokenIcon size={18} />
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4 break-all font-mono">TX: {depositTxHash.slice(0, 16)}...</p>
                <button type="button" onClick={resetDeposit}
                  className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold btn-press">{t('common.done')}</button>
              </div>
            ) : depositStatus === 'signing' || depositStatus === 'broadcasting' ? (
              <DepositProgressOverlay currentStep={depositStep} elapsedSec={depositElapsed} />
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">{t('balance.depositTitle')}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                  {t('balance.depositDesc')}
                </p>

                <div className="flex gap-2 mb-3">
                  {DEPOSIT_PRESETS.map((preset, i) => (
                    <button key={preset} type="button" onClick={() => setDepositAmount(String(preset))}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-bold border transition-colors ${
                        depositAmount === String(preset)
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                      }`}>{DEPOSIT_PRESET_LABELS[i]}</button>
                  ))}
                </div>

                <div className="relative mb-3">
                  <input type="text" inputMode="decimal" placeholder={t('balance.amountPlaceholder')} value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 pr-20 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={18} /></span>
                </div>

                {depositError && <p className="text-xs text-[var(--color-danger)] mb-3">{depositError}</p>}

                <div className="flex gap-2">
                  <button type="button" onClick={resetDeposit}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">{t('common.cancel')}</button>
                  <button type="button" onClick={handleDeposit}
                    disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                    className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
                    {t('common.deposit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ===== Withdraw Modal ===== */}
      {showWithdraw && (
        <Modal open onClose={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); }}>
          <div className="p-5 max-w-sm w-full">
            {withdrawStatus === 'success' ? (
              <div className="text-center py-4 animate-fade-up">
                <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--color-success)]/15 animate-bounce-in mb-3">
                  <CheckCircle size={28} className="text-[var(--color-success)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">{t('balance.withdrawSuccess')}</h3>
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold mb-1 text-[var(--color-success)] animate-number-pop">
                  -{parseFloat(withdrawAmount).toLocaleString()} <LaunchTokenIcon size={18} />
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                  {t('balance.withdrawSentDesc')}
                </p>
                <button type="button" onClick={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); }}
                  className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold btn-press">{t('common.done')}</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">{t('balance.withdrawTitle')}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mb-1">
                  {t('balance.withdrawAvailable', { amount: fmtNum(availableHuman) })} <span className="inline-flex items-center gap-1.5"><LaunchTokenIcon size={18} /></span>
                </p>

                <div className="flex gap-2 mt-3 mb-3">
                  {[0.25, 0.5, 1].map((frac) => (
                    <button key={frac} type="button"
                      onClick={() => setWithdrawAmount(String(Math.floor(availableHuman * frac)))}
                      className="flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-xs font-bold hover:border-[var(--color-primary)]/50">
                      {frac === 1 ? t('common.max') : `${frac * 100}%`}
                    </button>
                  ))}
                </div>

                <div className="relative mb-3">
                  <input type="text" inputMode="decimal" placeholder={t('balance.amountPlaceholder')} value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 pr-20 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={18} /></span>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); }}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">{t('common.cancel')}</button>
                  <button type="button" disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > availableHuman || withdrawMutation.isPending}
                    onClick={handleWithdraw}
                    className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
                    {withdrawMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        {t('common.processing')}
                      </span>
                    ) : t('common.withdraw')}
                  </button>
                </div>
                {withdrawMutation.isError && (
                  <p className="mt-2 text-xs text-[var(--color-danger)] text-center">{t('balance.withdrawFailed')}</p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
