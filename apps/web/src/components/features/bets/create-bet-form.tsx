'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useCreateBet, useGetVaultBalance, getGetVaultBalanceQueryKey, createBet as createBetApi } from '@coinflip/api-client';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { setBalanceGracePeriod } from '@/lib/balance-grace';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useToast } from '@/components/ui/toast';
import { AlertTriangle } from 'lucide-react';
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
import { extractErrorPayload, isActionInProgress, getUserFriendlyError } from '@/lib/user-friendly-errors';

interface CreateBetFormProps {
  /** Called when a bet is submitted to chain (before confirmation). Parent manages pending state. */
  onBetSubmitted?: (bet: { txHash: string; amount: string; maker: string }) => void;
  /** Controlled amount (for FAB modal — preserves value between open/close) */
  controlledAmount?: string;
  /** Callback when amount changes (used with controlledAmount) */
  onAmountChange?: (amount: string) => void;
  /** Called after submitted phase completes (e.g. to auto-close modal) */
  onSubmitComplete?: () => void;
  /** 'card' = default with border/bg, 'flat' = no wrapper styling (for inside modal) */
  variant?: 'card' | 'flat';
}

export function CreateBetForm({ onBetSubmitted, controlledAmount, onAmountChange, onSubmitComplete, variant = 'card' }: CreateBetFormProps) {
  const [internalAmount, setInternalAmount] = useState('');
  const amount = controlledAmount ?? internalAmount;
  const setAmount = onAmountChange ?? setInternalAmount;
  const [phase, setPhase] = useState<'pick' | 'confirm' | 'submitted'>('pick');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { address, isConnected, connect } = useWalletContext();
  const { data: grantStatus } = useGrantStatus();
  const { addToast } = useToast();

  const oneClickEnabled = grantStatus?.authz_granted ?? false;
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { addDeduction, removeDeduction, pendingDeduction, pendingBetCount } = usePendingBalance();

  const { data: balanceData } = useGetVaultBalance({
    query: { enabled: isConnected, refetchInterval: 15_000 },
  });

  // ── Open bets counter (SOURCE OF TRUTH: server's chain-based count) ──
  // Server returns `open_bets_count` = chain count + server pending. This is authoritative.
  // We add a local `localSubmitted` offset for bets submitted AFTER the last vault balance fetch.
  const [localSubmitted, setLocalSubmitted] = useState(0);

  // Reset localSubmitted when vault balance refetches (server count is now up to date)
  const serverOpenBetsCount: number | null = (balanceData?.data as any)?.open_bets_count ?? null;
  const lastServerCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (serverOpenBetsCount !== null && serverOpenBetsCount !== lastServerCountRef.current) {
      // Server provided a fresh count — it includes our pending bets, so reset local offset
      lastServerCountRef.current = serverOpenBetsCount;
      setLocalSubmitted(0);
    }
  }, [serverOpenBetsCount]);

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

        if (deductionIdRef.current) {
          removeDeduction(deductionIdRef.current);
          deductionIdRef.current = null;
        }

        // Apply server balance from 202 response — computed from pre-lock
        // snapshot minus this bet's amount, so it's always accurate.
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
          // Protect this accurate balance from stale WS-triggered refetches.
          setBalanceGracePeriod(5_000);
        }

        // Increment local submitted counter (tracks bets between server refetches)
        setLocalSubmitted(prev => prev + 1);

        // No delayed refetch needed — WebSocket events will invalidate queries
        // when the chain confirms the bet.

        const txHash = (response as any)?.tx_hash ?? '';
        addToast('success', t('bets.confirmingOnChain'));
        onBetSubmitted?.({ txHash, amount: betAmountRef.current, maker: address ?? '' });
        setPhase('submitted');
        setTimeout(() => {
          setAmount('');
          setPhase('pick');
          setSubmitted(false);
          onSubmitComplete?.();
        }, 2500);
      },
      onError: (err: unknown) => {
        // Revert optimistic balance deduction
        if (deductionIdRef.current) {
          removeDeduction(deductionIdRef.current);
          deductionIdRef.current = null;
        }
        setSubmitted(false);
        const { message } = extractErrorPayload(err);
        if (isActionInProgress(message)) {
          addToast('warning', t('bets.prevActionProcessing'));
        } else {
          addToast('error', getUserFriendlyError(err, t, 'create'));
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

      // Refetch bets list immediately; balance will be updated by WS events on chain confirm
      const vaultKey = getGetVaultBalanceQueryKey();
      queryClient.invalidateQueries({ queryKey: vaultKey });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });

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
      addToast('error', getUserFriendlyError(err, t, 'create'));
    } finally {
      setBatchSubmitting(false);
      setBatchCount('');
    }
  }, [isValidBatch, parsedBatchCount, parsedAmount, batchMode, parsedBatchMin, parsedBatchMax, batchSubmitting, addDeduction, removeDeduction, address, onBetSubmitted, queryClient, addToast, t]);

  return (
    <div className={variant === 'card' ? 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden' : ''}>
      <div className={variant === 'card' ? 'p-5' : ''}>
      {/* Authz Setup Warning */}
      {isConnected && !oneClickEnabled && grantStatus !== undefined && (
        <div className="mb-4 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={20} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
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
        <div className="flex flex-col items-center gap-3 py-8 animate-fade-up">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[var(--color-success)]/20 animate-[fabPing_1.5s_ease-out_infinite]" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <svg className="h-8 w-8 text-[var(--color-success)] animate-[scaleIn_0.3s_ease-out]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <p className="text-lg font-bold">{t('wager.betSubmitted')}</p>
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text)]">{parsedAmount.toLocaleString()}</span>
            <LaunchTokenIcon size={45} />
            <span>COIN</span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] animate-pulse mt-1">
            {t('common.confirming')}
          </p>
        </div>
      ) : phase === 'confirm' ? (
        <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
          {/* Amount hero */}
          <div className="flex flex-col items-center gap-1 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] font-medium">{t('wager.youreFlipping')}</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black tabular-nums">{parsedAmount.toLocaleString()}</span>
              <LaunchTokenIcon size={60} />
            </div>
          </div>

          {/* Details card */}
          <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3.5 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.ifYouWin')}</span>
              <span className="flex items-center gap-1.5 font-bold text-[var(--color-success)]">+{winPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })} <LaunchTokenIcon size={40} /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">{t('wager.winChance')}</span>
              <span className="font-bold">{t('wager.winChanceValue')}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary)]">{t('wager.commission')}</span>
              <span className="text-[var(--color-text-secondary)]">{t('wager.commissionValue')}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button type="button" onClick={handleCancel}
              className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors active:scale-[0.98]">
              {t('common.back')}
            </button>
            <button type="button" disabled={createBet.isPending || submitted} onClick={handleSubmit}
              className="flex-[2] rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-indigo-500 px-4 py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50 active:scale-[0.98]">
              {createBet.isPending || submitted ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('common.submitting')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  {t('wager.confirmFlip')}
                </span>
              )}
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
            <label className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              {t('wager.chooseAmount')}
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {BET_PRESETS.map((preset, idx) => (
                <button key={preset} type="button" onClick={() => setAmount(String(preset))}
                  className={`rounded-lg px-2 py-2.5 text-xs font-bold transition-all active:scale-[0.96] ${
                    amount === String(preset)
                      ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20'
                      : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/30'
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
                  const parts = val.split('.');
                  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                  setAmount(val);
                }}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 pr-12 text-sm font-medium placeholder:text-[var(--color-text-secondary)]/50 focus:border-[var(--color-primary)] focus:outline-none transition-colors"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <LaunchTokenIcon size={40} />
              </span>
            </div>
            {parsedAmount > 0 && parsedAmount < 1 && (
              <p className="mt-1.5 text-[10px] text-[var(--color-warning)]">{t('wager.minAmount')}</p>
            )}
            {parsedAmount > availableHuman && availableHuman > 0 && (
              <p className="mt-1.5 text-[10px] text-[var(--color-danger)]">
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
            className={`w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] ${
              isValidAmount
                ? 'bg-gradient-to-r from-[var(--color-primary)] to-indigo-500 text-white shadow-lg shadow-[var(--color-primary)]/25 hover:shadow-[var(--color-primary)]/40 hover:brightness-110'
                : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
            }`}>
            {!isConnected
              ? t('common.connectWallet')
              : !oneClickEnabled
                ? t('wager.enableFirst')
                : !canCreateBet
                  ? t('wager.betLimitReached', { max: MAX_OPEN_BETS_PER_USER })
                  : isValidAmount
                    ? <span className="flex items-center justify-center gap-1.5">{t('wager.flipFor', { amount: parsedAmount.toLocaleString() })} <LaunchTokenIcon size={45} /></span>
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
                        <span className="absolute right-2 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={35} /></span>
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
                        <span className="absolute right-2 top-1/2 -translate-y-1/2"><LaunchTokenIcon size={35} /></span>
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
                          {t('wager.batchCalc', { count: parsedBatchCount, amount: parsedAmount.toLocaleString(), total: batchFixedTotal.toLocaleString() })} <LaunchTokenIcon size={35} />
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
                          })} <LaunchTokenIcon size={35} />
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
      </div>

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
