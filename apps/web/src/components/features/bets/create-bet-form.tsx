'use client';

import { useState, useCallback, useRef } from 'react';
import { useCreateBet, useGetVaultBalance, getGetVaultBalanceQueryKey, createBet as createBetApi } from '@coinflip/api-client';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useToast } from '@/components/ui/toast';
import { LaunchTokenIcon } from '@/components/ui';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { useTranslation } from '@/lib/i18n';
import {
  BET_PRESETS,
  BET_PRESET_LABELS,
  COMMISSION_BPS,
  MAX_OPEN_BETS_PER_USER,
  MAX_BATCH_SIZE,
  toMicroLaunch,
  fromMicroLaunch,
} from '@coinflip/shared/constants';

interface CreateBetFormProps {
  /** Called when a bet is submitted to chain (before confirmation). Parent manages pending state. */
  onBetSubmitted?: (bet: { txHash: string; amount: string; maker: string }) => void;
}

export function CreateBetForm({ onBetSubmitted }: CreateBetFormProps) {
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<'pick' | 'confirm' | 'submitted'>('pick');
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { address, isConnected, connect } = useWalletContext();
  const { data: grantStatus } = useGrantStatus();
  const { addToast } = useToast();

  const oneClickEnabled = grantStatus?.authz_granted ?? false;
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { addDeduction, removeDeduction, pendingDeduction, pendingBetCount, isFrozen } = usePendingBalance();

  const { data: balanceData } = useGetVaultBalance({
    query: { enabled: isConnected, refetchInterval: isFrozen ? false : 8_000 },
  });

  // ── Open bets counter (SOURCE OF TRUTH: server's chain-based count) ──
  // Server returns `open_bets_count` = chain count + server pending. This is authoritative.
  // We add a local `localSubmitted` offset for bets submitted AFTER the last vault balance fetch.
  const [localSubmitted, setLocalSubmitted] = useState(0);

  // Reset localSubmitted when vault balance refetches (server count is now up to date)
  const serverOpenBetsCount: number | null = (balanceData?.data as any)?.open_bets_count ?? null;
  const lastServerCountRef = useRef<number | null>(null);
  if (serverOpenBetsCount !== null && serverOpenBetsCount !== lastServerCountRef.current) {
    // Server provided a fresh count — it includes our pending bets, so reset local offset
    lastServerCountRef.current = serverOpenBetsCount;
    if (localSubmitted > 0) {
      setLocalSubmitted(0);
    }
  }

  // Compute effective count: server count (authoritative) + local offset (for gap between submit and refetch)
  const serverCount = serverOpenBetsCount ?? 0;
  const myOpenBetsCount = serverCount + localSubmitted + pendingBetCount;
  const remainingSlots = Math.max(0, MAX_OPEN_BETS_PER_USER - myOpenBetsCount);
  const canCreateBet = remainingSlots > 0;

  // Subtract pending deductions from available balance so user can't over-bet
  const rawAvailableMicro = BigInt(balanceData?.data?.available ?? '0');
  const effectiveAvailableMicro = rawAvailableMicro - pendingDeduction < 0n ? 0n : rawAvailableMicro - pendingDeduction;
  const availableHuman = fromMicroLaunch(effectiveAvailableMicro);

  // Track deduction ID for the current submission
  const deductionIdRef = useRef<string | null>(null);

  // Store the bet amount for use in onSuccess (closure over latest value)
  const betAmountRef = useRef('');

  const createBet = useCreateBet({
    mutation: {
      onSuccess: (response) => {
        const vaultKey = getGetVaultBalanceQueryKey();

        // Server returns corrected balance in 202 response (with pending locks deducted)
        const serverBalance = (response as any)?.balance;
        if (serverBalance) {
          queryClient.setQueryData(vaultKey, (old: any) => ({
            ...old,
            data: {
              ...(old?.data ?? {}),
              available: serverBalance.available,
              locked: serverBalance.locked,
            },
          }));
        }

        // Remove the pending deduction (server balance is authoritative now)
        if (deductionIdRef.current) {
          removeDeduction(deductionIdRef.current);
          deductionIdRef.current = null;
        }

        // Increment local submitted counter (tracks bets between server refetches)
        setLocalSubmitted(prev => prev + 1);

        // Refetch bets list + balance after delays (chain confirmation takes ~10s)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: vaultKey });
          queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
        }, 8000);

        const txHash = (response as any)?.tx_hash ?? '';
        addToast('success', t('bets.confirmingOnChain'));
        onBetSubmitted?.({ txHash, amount: betAmountRef.current, maker: address ?? '' });
        setPhase('submitted');
        setTimeout(() => {
          setAmount('');
          setPhase('pick');
          setSubmitted(false);
        }, 2500);
      },
      onError: (err: unknown) => {
        // Revert optimistic balance deduction
        if (deductionIdRef.current) {
          removeDeduction(deductionIdRef.current);
          deductionIdRef.current = null;
        }
        setSubmitted(false);
        const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: string }).message) : 'Unknown error';
        const is429 = msg.includes('still processing') || msg.includes('ACTION_IN_PROGRESS');
        if (is429) {
          addToast('warning', t('bets.prevActionProcessing'));
        } else {
          addToast('error', t('common.error') + ': ' + msg);
        }
      },
    },
  });

  const parsedAmount = parseFloat(amount) || 0;
  const isValidAmount = parsedAmount >= 1 && parsedAmount <= availableHuman && canCreateBet;
  const winPayout = parsedAmount * 2 * (1 - COMMISSION_BPS / 10000);

  const handleConfirm = useCallback(() => {
    if (!isValidAmount || !address || !canCreateBet) return;
    setPhase('confirm');
  }, [isValidAmount, address, canCreateBet]);

  const handleCancel = useCallback(() => {
    setPhase('pick');
  }, []);

  // Track whether we already submitted to prevent multi-clicks
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!isValidAmount || submitted) return;
    setSubmitted(true);
    const microAmount = toMicroLaunch(parsedAmount);
    // Store amount for onSuccess handler (it needs it for cache update)
    betAmountRef.current = microAmount;
    // Immediately deduct from displayed balance + increment pending bet count
    deductionIdRef.current = addDeduction(microAmount, true);
    // Server generates side + secret + commitment — client just sends amount
    createBet.mutate({ data: { amount: microAmount } });
  }, [isValidAmount, parsedAmount, createBet, submitted, addDeduction]);

  // ─── Batch mode ───
  const [batchCount, setBatchCount] = useState('');
  const [batchMode, setBatchMode] = useState<'fixed' | 'random'>('fixed');
  const [batchMinAmount, setBatchMinAmount] = useState('');
  const [batchMaxAmount, setBatchMaxAmount] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const parsedBatchCount = parseInt(batchCount) || 0;

  // For fixed mode: reuse selected amount; for random mode: use max_amount for worst-case balance check
  const parsedBatchMin = parseFloat(batchMinAmount) || 0;
  const parsedBatchMax = parseFloat(batchMaxAmount) || 0;

  const batchFixedTotal = parsedAmount * parsedBatchCount;
  const batchRandomMaxTotal = parsedBatchMax * parsedBatchCount; // worst-case

  const maxBatchCountFixed = Math.min(
    MAX_BATCH_SIZE,
    remainingSlots,
    availableHuman > 0 && parsedAmount > 0 ? Math.floor(availableHuman / parsedAmount) : 0,
  );
  const maxBatchCountRandom = Math.min(
    MAX_BATCH_SIZE,
    remainingSlots,
    availableHuman > 0 && parsedBatchMax > 0 ? Math.floor(availableHuman / parsedBatchMax) : 0,
  );
  const maxBatchCount = batchMode === 'fixed' ? maxBatchCountFixed : maxBatchCountRandom;

  const isValidBatchFixed = batchMode === 'fixed'
    && parsedBatchCount >= 2 && parsedBatchCount <= maxBatchCount
    && parsedAmount >= 1 && canCreateBet && batchFixedTotal <= availableHuman;
  const isValidBatchRandom = batchMode === 'random'
    && parsedBatchCount >= 2 && parsedBatchCount <= maxBatchCount
    && parsedBatchMin >= 1 && parsedBatchMax >= parsedBatchMin
    && batchRandomMaxTotal <= availableHuman && canCreateBet;
  const isValidBatch = batchMode === 'fixed' ? isValidBatchFixed : isValidBatchRandom;

  const handleBatchConfirm = useCallback(async () => {
    if (!isValidBatch || batchSubmitting) return;
    setBatchSubmitting(true);

    const count = parsedBatchCount;
    const totalEstimate = batchMode === 'fixed'
      ? toMicroLaunch(parsedAmount * count)
      : toMicroLaunch(parsedBatchMax * count); // worst-case lock

    // Add a single large deduction for the batch
    const deductionId = addDeduction(totalEstimate, true);

    try {
      const data = batchMode === 'fixed'
        ? { mode: 'fixed' as const, count, amount: toMicroLaunch(parsedAmount) }
        : { mode: 'random' as const, count, min_amount: toMicroLaunch(parsedBatchMin), max_amount: toMicroLaunch(parsedBatchMax) };

      const response = await customFetch<any>({
        url: '/api/v1/bets/batch',
        method: 'POST',
        data,
      });

      const result = response as any;
      const submitted = result?.data?.submitted ?? 0;
      const failed = result?.data?.failed ?? 0;
      const totalAmount = result?.data?.total_amount ?? '0';

      // Remove optimistic deduction and replace with actual
      removeDeduction(deductionId);

      // Update local submitted counter
      setLocalSubmitted(prev => prev + submitted);

      // Refetch
      const vaultKey = getGetVaultBalanceQueryKey();
      queryClient.invalidateQueries({ queryKey: vaultKey });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: vaultKey });
        queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
      }, 8000);

      if (failed === 0) {
        addToast('success', t('wager.batchSuccess', { done: submitted }));
      } else {
        addToast('warning', t('wager.batchPartial', { done: submitted, errors: failed }));
      }

      // Notify parent for each bet
      const bets = result?.data?.bets ?? [];
      for (const bet of bets) {
        if (bet.tx_hash) {
          onBetSubmitted?.({ txHash: bet.tx_hash, amount: bet.amount, maker: address ?? '' });
        }
      }
    } catch (err: unknown) {
      removeDeduction(deductionId);
      const msg = err instanceof Error ? err.message : 'Batch creation failed';
      addToast('error', msg);
    } finally {
      setBatchSubmitting(false);
      setBatchCount('');
    }
  }, [isValidBatch, parsedBatchCount, parsedAmount, batchMode, parsedBatchMin, parsedBatchMax, batchSubmitting, addDeduction, removeDeduction, address, onBetSubmitted, queryClient, addToast, t]);

  // On mobile, show compact summary when collapsed
  const mobileIsCollapsed = mobileCollapsed && phase === 'pick';

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Mobile collapsible header */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileCollapsed(!mobileCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 active:bg-[var(--color-surface-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">{t('wager.title')}</span>
            {parsedAmount > 0 && (
              <span className="rounded-lg bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]">
                {parsedAmount.toLocaleString()} L
              </span>
            )}
          </div>
          <svg
            className={`h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${!mobileIsCollapsed ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Collapsed: show quick-create button inline */}
        {mobileIsCollapsed && isConnected && oneClickEnabled && isValidAmount && (
          <div className="px-4 pb-3 -mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)] btn-press"
            >
              {t('wager.flipFor', { amount: parsedAmount.toLocaleString() })} <LaunchTokenIcon size={48} />
            </button>
          </div>
        )}
      </div>

      {/* Content: always visible on desktop, collapsible on mobile */}
      <div className={`p-5 pt-0 md:!block md:p-5 ${mobileIsCollapsed ? 'hidden' : ''}`}>
      {/* Authz Setup Warning */}
      {isConnected && !oneClickEnabled && grantStatus !== undefined && (
        <div className="mb-4 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 p-3">
          <div className="flex items-start gap-2">
            <svg className="h-5 w-5 text-[var(--color-warning)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-[var(--color-warning)] mb-1">{t('wager.oneClickRequired')}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                {t('wager.oneClickDesc')}
              </p>
              <button
                type="button"
                onClick={() => setShowOnboarding(true)}
                className="mt-1 rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[var(--color-warning)]/80"
              >
                {t('wager.enableOneClick')}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'submitted' ? (
        <div className="flex flex-col items-center gap-3 py-6 animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
            <span className="h-7 w-7 animate-spin rounded-full border-3 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
          </div>
          <p className="text-base font-bold">{t('wager.betSubmitted')}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {parsedAmount.toLocaleString()} <LaunchTokenIcon size={48} />
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] animate-pulse">
            {t('common.confirming')}
          </p>
        </div>
      ) : phase === 'confirm' ? (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          <h3 className="text-lg font-bold">{t('wager.confirmBet')}</h3>
          <div className="rounded-xl bg-[var(--color-bg)] p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.wagerLabel')}</span>
              <span className="flex items-center gap-1.5 font-bold">{parsedAmount.toLocaleString()} <LaunchTokenIcon size={48} /></span>
            </div>
            <div className="border-t border-[var(--color-border)]" />
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.ifYouWin')}</span>
              <span className="flex items-center gap-1.5 font-bold text-[var(--color-success)]">+{winPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })} <LaunchTokenIcon size={48} /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.commission')}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">{t('wager.commissionValue')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.winChance')}</span>
              <span className="font-bold">{t('wager.winChanceValue')}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={handleCancel}
              className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold hover:bg-[var(--color-surface-hover)]">
              {t('common.back')}
            </button>
            <button type="button" disabled={createBet.isPending || submitted} onClick={handleSubmit}
              className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold hover:bg-[var(--color-primary-hover)] disabled:opacity-50 btn-press">
              {createBet.isPending || submitted ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('common.submitting')}
                </span>
              ) : t('wager.createBet')}
            </button>
          </div>
          {createBet.isError && (
            <p className="text-xs text-[var(--color-danger)] text-center">{t('wager.failedToCreate')}</p>
          )}
        </div>
      ) : (
        <>
          {/* Amount Presets */}
          <div className="mb-3">
            <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">{t('wager.wagerInputLabel')}</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {BET_PRESETS.map((preset, idx) => (
                <button key={preset} type="button" onClick={() => setAmount(String(preset))}
                  className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                    amount === String(preset)
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}>
                  {BET_PRESET_LABELS[idx]}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t('wager.customAmount')}
                value={amount}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^0-9.]/g, '');
                  // Allow only one decimal point
                  const parts = val.split('.');
                  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                  setAmount(val);
                }}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 pr-20 text-sm placeholder:text-[var(--color-text-secondary)]/50 focus:border-[var(--color-primary)] focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={48} /></span>
            </div>
            {parsedAmount > 0 && parsedAmount < 1 && (
              <p className="mt-1 text-[10px] text-[var(--color-warning)]">{t('wager.minAmount')}</p>
            )}
            {parsedAmount > availableHuman && availableHuman > 0 && (
              <p className="mt-1 text-[10px] text-[var(--color-danger)]">
                {t('wager.insufficientBalance', { amount: availableHuman.toLocaleString() })}
              </p>
            )}
          </div>

          {/* Bet limit counter */}
          {isConnected && (
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">
                {t('wager.openBetsCount', { count: myOpenBetsCount, max: MAX_OPEN_BETS_PER_USER })}
              </span>
              {!canCreateBet && (
                <span className="text-[var(--color-danger)] font-medium">{t('wager.limitReached')}</span>
              )}
              {canCreateBet && remainingSlots <= 5 && (
                <span className="text-[var(--color-warning)]">{t('wager.remaining', { count: remainingSlots })}</span>
              )}
            </div>
          )}

          {/* Create Button */}
          <button type="button" disabled={!isValidAmount || !isConnected || (!oneClickEnabled && isConnected) || !canCreateBet || batchSubmitting}
            onClick={isConnected ? handleConfirm : connect}
            className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3.5 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40 btn-press">
            {!isConnected
              ? t('common.connectWallet')
              : !oneClickEnabled
                ? t('wager.enableFirst')
                : !canCreateBet
                  ? t('wager.betLimitReached', { max: MAX_OPEN_BETS_PER_USER })
                  : isValidAmount
                    ? <><span>{t('wager.flipFor', { amount: parsedAmount.toLocaleString() })} </span><LaunchTokenIcon size={48} /></>
                    : t('wager.enterAmount')}
          </button>

          {/* ─── Batch Mode ─── */}
          {isConnected && oneClickEnabled && (
            <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] tracking-wide">
                  {t('wager.batchCreate')}
                </p>
                {/* Mode toggle */}
                <div className="flex rounded-lg bg-[var(--color-surface)] p-0.5 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setBatchMode('fixed')}
                    className={`rounded-md px-2.5 py-1 transition-colors ${batchMode === 'fixed' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}
                  >
                    {t('wager.batchModeFixed')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMode('random')}
                    className={`rounded-md px-2.5 py-1 transition-colors ${batchMode === 'random' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}
                  >
                    {t('wager.batchModeRandom')}
                  </button>
                </div>
              </div>

              {batchSubmitting ? (
                /* Submitting spinner */
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
                  <span className="text-xs font-medium">{t('wager.creating', { total: parsedBatchCount })}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Random mode: min/max amount inputs */}
                  {batchMode === 'random' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={t('wager.minAmount')}
                          value={batchMinAmount}
                          onChange={(e) => setBatchMinAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={32} /></span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={t('wager.maxAmount')}
                          value={batchMaxAmount}
                          onChange={(e) => setBatchMaxAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={32} /></span>
                      </div>
                    </div>
                  )}

                  {/* Count + Submit */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t('wager.countPlaceholder')}
                          value={batchCount}
                          onChange={(e) => setBatchCount(e.target.value.replace(/\D/g, ''))}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-12 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-secondary)]">
                          {t('wager.pcs')} (2-{Math.min(MAX_BATCH_SIZE, maxBatchCount || MAX_BATCH_SIZE)})
                        </span>
                      </div>
                      {parsedBatchCount > 0 && batchMode === 'fixed' && parsedAmount > 0 && (
                        <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                          {t('wager.batchCalc', { count: parsedBatchCount, amount: parsedAmount.toLocaleString(), total: batchFixedTotal.toLocaleString() })} <LaunchTokenIcon size={32} />
                          {parsedBatchCount > maxBatchCount && maxBatchCount > 0 && (
                            <span className="text-[var(--color-danger)] ml-1">{t('wager.batchMax', { max: maxBatchCount })}</span>
                          )}
                        </p>
                      )}
                      {parsedBatchCount > 0 && batchMode === 'random' && parsedBatchMax > 0 && (
                        <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                          {t('wager.batchRandomCalc', {
                            count: parsedBatchCount,
                            min: parsedBatchMin.toLocaleString(),
                            max: parsedBatchMax.toLocaleString(),
                            total: batchRandomMaxTotal.toLocaleString(),
                          })} <LaunchTokenIcon size={32} />
                          {batchRandomMaxTotal > availableHuman && (
                            <span className="text-[var(--color-danger)] ml-1">{t('wager.batchRandomMax', { available: availableHuman.toLocaleString() })}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!isValidBatch}
                      onClick={handleBatchConfirm}
                      className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('wager.createBatchBtn', { count: parsedBatchCount > 1 ? parsedBatchCount : '' })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>{/* end collapsible content */}

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
