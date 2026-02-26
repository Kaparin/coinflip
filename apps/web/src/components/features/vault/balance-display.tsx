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
import { signDepositTxBytes, signDeposit } from '@/lib/wallet-signer';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { API_URL, EXPLORER_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

/** Extract tx hash from CosmJS timeout error: "Transaction with ID 7C77... was submitted..." */
function extractTxHashFromError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/Transaction with ID ([A-F0-9a-f]+)/i);
  return m?.[1] ?? null;
}
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { setBalanceGracePeriod } from '@/lib/balance-grace';
import { useTranslation } from '@/lib/i18n';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';

/** Deposit presets in human-readable LAUNCH */
const DEPOSIT_PRESETS = [100, 500, 1000];
const DEPOSIT_PRESET_LABELS = ['100', '500', '1K'];

type DepositStep = 'connecting' | 'signing' | 'broadcasting' | 'confirming';

const DEPOSIT_STEPS: DepositStep[] = ['connecting', 'signing', 'broadcasting', 'confirming'];

type WithdrawStep = 'checking' | 'locking' | 'relaying' | 'confirming';

const WITHDRAW_STEPS: WithdrawStep[] = ['checking', 'locking', 'relaying', 'confirming'];

function WithdrawProgressOverlay({ elapsedSec }: { elapsedSec: number }) {
  const { t, locale } = useTranslation();
  const isRu = locale === 'ru';
  const stepLabels: Record<WithdrawStep, string> = {
    checking: isRu ? 'Проверка баланса' : 'Checking balance',
    locking: isRu ? 'Блокировка средств' : 'Locking funds',
    relaying: isRu ? 'Отправка транзакции в блокчейн' : 'Submitting transaction to blockchain',
    confirming: isRu ? 'Ожидание подтверждения' : 'Waiting for confirmation',
  };

  // Simulate step progression based on elapsed time
  let currentStep: WithdrawStep = 'checking';
  if (elapsedSec >= 2) currentStep = 'locking';
  if (elapsedSec >= 4) currentStep = 'relaying';
  if (elapsedSec >= 8) currentStep = 'confirming';
  const currentIdx = WITHDRAW_STEPS.indexOf(currentStep);

  return (
    <div className="py-2 space-y-5">
      {/* Animated spinner */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin" />
          <LaunchTokenIcon size={60} />
        </div>
        <h3 className="text-base font-bold">{t('balance.withdrawInProgress')}</h3>
      </div>

      {/* Step list */}
      <div className="space-y-2.5">
        {WITHDRAW_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;

          return (
            <div key={step} className="flex items-center gap-3">
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
          <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('balance.depositDoNotClose')}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {isRu ? 'Обычно занимает 5-15 секунд' : 'Usually takes 5-15 seconds'} · {elapsedSec}{isRu ? 'с' : 's'}
          </p>
        </div>
      </div>
    </div>
  );
}

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
          <LaunchTokenIcon size={60} />
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
  const { t, locale } = useTranslation();
  const { isConnected, isConnecting, address, getWallet, connect } = useWalletContext();
  const { pendingDeduction } = usePendingBalance();
  const { data, isLoading } = useGetVaultBalance({
    query: {
      enabled: isConnected,
      refetchInterval: 15_000,
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
  const [depositErrorTxHash, setDepositErrorTxHash] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositElapsed, setDepositElapsed] = useState(0);
  const depositTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [withdrawStatus, setWithdrawStatus] = useState<'idle' | 'signing' | 'success' | 'error' | 'timeout'>('idle');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawErrorTxHash, setWithdrawErrorTxHash] = useState<string | null>(null);
  const [withdrawElapsed, setWithdrawElapsed] = useState(0);
  const withdrawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track the micro amount of in-flight withdraw for optimistic updates
  const lastWithdrawMicroRef = useRef('0');
  const lastWithdrawHumanRef = useRef('0');

  // Elapsed timer for withdraw
  useEffect(() => {
    if (withdrawStatus === 'signing') {
      setWithdrawElapsed(0);
      withdrawTimerRef.current = setInterval(() => setWithdrawElapsed(s => s + 1), 1000);
    } else {
      if (withdrawTimerRef.current) {
        clearInterval(withdrawTimerRef.current);
        withdrawTimerRef.current = null;
      }
    }
    return () => { if (withdrawTimerRef.current) clearInterval(withdrawTimerRef.current); };
  }, [withdrawStatus]);

  const withdrawMutation = useWithdrawFromVault({
    mutation: {
      onMutate: () => {
        setWithdrawStatus('signing');
        setWithdrawError('');
        setWithdrawErrorTxHash(null);
      },
      onSuccess: () => {
        const microAmount = lastWithdrawMicroRef.current;
        setWithdrawStatus('success');

        // Optimistic update: immediately reflect the balance change in UI
        queryClient.setQueryData(['/api/v1/vault/balance'], (old: any) => {
          if (!old?.data) return old;
          const newAvailable = BigInt(old.data.available) - BigInt(microAmount);
          const newTotal = BigInt(old.data.total) - BigInt(microAmount);
          return {
            ...old,
            data: {
              ...old.data,
              available: (newAvailable < 0n ? 0n : newAvailable).toString(),
              total: (newTotal < 0n ? 0n : newTotal).toString(),
            },
          };
        });

        // Optimistic update: add to wallet CW20 balance
        queryClient.setQueryData(['wallet-cw20-balance', address], (old: any) => {
          return (BigInt(old ?? '0') + BigInt(microAmount)).toString();
        });

        // Protect optimistic update from stale WS-triggered refetches
        setBalanceGracePeriod(8_000);
        queryClient.cancelQueries({ queryKey: ['/api/v1/vault/balance'] });

        // Refetch after grace period for eventual consistency
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['/api/v1/vault/balance'] });
          queryClient.refetchQueries({ queryKey: ['wallet-cw20-balance'] });
        }, 8_000);
      },
      onError: (err) => {
        const error = err as { error?: { message?: string; details?: { txHash?: string }; code?: string } };
        const errMsg = error?.error?.message ?? '';
        const txHash = error?.error?.details?.txHash ?? null;

        // Detect timeout/network errors — the transaction may still succeed on chain
        const isTimeout = err instanceof DOMException && err.name === 'AbortError';
        const isNetworkErr = err instanceof TypeError;

        if (isTimeout || isNetworkErr) {
          // Don't show as "failed" — show optimistic success with a note
          setWithdrawStatus('timeout');
          // Apply optimistic updates anyway — balance will correct on next refetch
          const microAmount = lastWithdrawMicroRef.current;
          queryClient.setQueryData(['/api/v1/vault/balance'], (old: any) => {
            if (!old?.data) return old;
            const newAvailable = BigInt(old.data.available) - BigInt(microAmount);
            const newTotal = BigInt(old.data.total) - BigInt(microAmount);
            return {
              ...old,
              data: {
                ...old.data,
                available: (newAvailable < 0n ? 0n : newAvailable).toString(),
                total: (newTotal < 0n ? 0n : newTotal).toString(),
              },
            };
          });
          queryClient.setQueryData(['wallet-cw20-balance', address], (old: any) => {
            return (BigInt(old ?? '0') + BigInt(microAmount)).toString();
          });
          // Protect optimistic update, refetch after grace period
          setBalanceGracePeriod(8_000);
          queryClient.cancelQueries({ queryKey: ['/api/v1/vault/balance'] });
          setTimeout(() => {
            queryClient.refetchQueries({ queryKey: ['/api/v1/vault/balance'] });
            queryClient.refetchQueries({ queryKey: ['wallet-cw20-balance'] });
          }, 8_000);
        } else {
          setWithdrawError(getUserFriendlyError(err, t, 'withdraw'));
          setWithdrawErrorTxHash(txHash);
          setWithdrawStatus('error');
        }
      },
    },
  });

  // Global in-flight flag: blocks ALL deposit/withdraw buttons while any operation is active
  const isOperationInFlight = depositStatus === 'signing' || depositStatus === 'broadcasting' || withdrawMutation.isPending || withdrawStatus === 'signing';

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

  // --- Deposit via Web Wallet (optimized: sign locally, broadcast via server) ---
  const handleDeposit = useCallback(async () => {
    if (!address || !depositAmount) return;
    const parsedHuman = parseFloat(depositAmount);
    if (isNaN(parsedHuman) || parsedHuman <= 0) return;

    // Pre-check: does the wallet have enough CW20 tokens?
    if (walletBalanceHuman < parsedHuman) {
      setDepositError(t('balance.insufficientWalletBalance', { need: parsedHuman, have: walletBalanceHuman.toFixed(2) }));
      setDepositStatus('error');
      return;
    }

    const wallet = getWallet();
    if (!wallet) {
      setDepositError(t('balance.walletNotUnlocked'));
      setDepositStatus('error');
      return;
    }

    try {
      setDepositStatus('signing');
      setDepositError('');
      setDepositErrorTxHash(null);

      // Step 1: Connect to cached client (or create new one)
      setDepositStep('connecting');

      // Step 2: Sign transaction locally (queries account sequence — 1 RPC call)
      // Uses cached client + fixed gas (no simulate roundtrip)
      setDepositStep('signing');
      const { txBytes } = await signDepositTxBytes(wallet, address, parsedHuman);

      // Step 3: Broadcast via API server (direct RPC connection, no Vercel proxy)
      setDepositStep('broadcasting');
      setDepositStatus('broadcasting');

      const broadcastRes = await fetch(`${API_URL}/api/v1/vault/deposit/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(address ? { 'x-wallet-address': address } : {}),
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ tx_bytes: txBytes }),
      });

      const broadcastData = await broadcastRes.json();

      if (!broadcastRes.ok) {
        const errMsg = broadcastData?.error?.message ?? t('balance.depositFailed');
        const errTxHash = broadcastData?.error?.details?.txHash;
        setDepositError(errMsg);
        if (errTxHash) setDepositErrorTxHash(errTxHash);
        setDepositStatus('error');
        return;
      }

      // Step 4: Confirmed (or pending)
      setDepositStep('confirming');
      const result = broadcastData.data;
      setDepositTxHash(result.tx_hash);
      setDepositStatus('success');

      // Optimistic update: immediately reflect deposit in balances
      const depositMicro = toMicroLaunch(parsedHuman);
      queryClient.setQueryData(['/api/v1/vault/balance'], (old: any) => {
        if (!old?.data) return old;
        const newAvailable = BigInt(old.data.available) + BigInt(depositMicro);
        const newTotal = BigInt(old.data.total) + BigInt(depositMicro);
        return {
          ...old,
          data: {
            ...old.data,
            available: newAvailable.toString(),
            total: newTotal.toString(),
          },
        };
      });

      // Optimistic update: subtract from wallet CW20 balance
      queryClient.setQueryData(['wallet-cw20-balance', address], (old: any) => {
        const newBal = BigInt(old ?? '0') - BigInt(depositMicro);
        return (newBal < 0n ? 0n : newBal).toString();
      });

      // Protect optimistic update from stale WS-triggered refetches.
      // Server's chain cache may briefly hold pre-deposit balance (REST node lag).
      setBalanceGracePeriod(8_000);
      queryClient.cancelQueries({ queryKey: ['/api/v1/vault/balance'] });

      // Refetch after grace period for eventual consistency
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['/api/v1/vault/balance'] });
        queryClient.refetchQueries({ queryKey: ['wallet-cw20-balance'] });
      }, 8_000);
    } catch (err) {
      // If optimized flow fails, try legacy full client-side deposit as fallback
      try {
        setDepositStep('broadcasting');
        setDepositStatus('broadcasting');
        const result = await signDeposit(wallet, address, parsedHuman);
        setDepositStep('confirming');
        setDepositTxHash(result.txHash);
        setDepositStatus('success');

        // Optimistic update (same as above)
        const depositMicro = toMicroLaunch(parsedHuman);
        queryClient.setQueryData(['/api/v1/vault/balance'], (old: any) => {
          if (!old?.data) return old;
          const newAvailable = BigInt(old.data.available) + BigInt(depositMicro);
          const newTotal = BigInt(old.data.total) + BigInt(depositMicro);
          return { ...old, data: { ...old.data, available: newAvailable.toString(), total: newTotal.toString() } };
        });
        queryClient.setQueryData(['wallet-cw20-balance', address], (old: any) => {
          const newBal = BigInt(old ?? '0') - BigInt(depositMicro);
          return (newBal < 0n ? 0n : newBal).toString();
        });
        setBalanceGracePeriod(8_000);
        queryClient.cancelQueries({ queryKey: ['/api/v1/vault/balance'] });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['/api/v1/vault/balance'] });
          queryClient.refetchQueries({ queryKey: ['wallet-cw20-balance'] });
        }, 8_000);
      } catch (fallbackErr) {
        setDepositError(getUserFriendlyError(fallbackErr, t, 'deposit'));
        setDepositErrorTxHash(extractTxHashFromError(fallbackErr));
        setDepositStatus('error');
      }
    }
  }, [address, depositAmount, walletBalanceHuman, getWallet, queryClient, t]);

  const resetDeposit = () => {
    setShowDeposit(false);
    setDepositAmount('');
    setDepositStatus('idle');
    setDepositStep('connecting');
    setDepositError('');
    setDepositErrorTxHash(null);
    setDepositTxHash('');
    setDepositElapsed(0);
  };

  const handleWithdraw = () => {
    if (isOperationInFlight) return;
    const parsedHuman = parseFloat(withdrawAmount);
    if (isNaN(parsedHuman) || parsedHuman <= 0 || parsedHuman > availableHuman) return;
    const microAmount = toMicroLaunch(parsedHuman);
    lastWithdrawMicroRef.current = microAmount;
    lastWithdrawHumanRef.current = withdrawAmount;
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
            <div className="rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 p-3 mb-3">
              <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.walletBalanceAxiome')}</p>
              <p className="flex items-center gap-2 text-sm font-bold tabular-nums">
                <LaunchTokenIcon size={45} />
                {fmtNum(walletBalanceHuman)}
              </p>
              <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">{t('balance.depositToPlay')}</p>
            </div>

            {/* Vault balance (deposited in contract) */}
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-1.5 font-medium tracking-wide">{t('balance.gameVault')}</p>
            <div className="grid gap-2 grid-cols-3 mb-3">
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.available')}</p>
                <p className="text-lg font-bold tabular-nums text-[var(--color-success)]">{fmtNum(availableHuman)}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.inBets')}</p>
                <p className="text-lg font-bold tabular-nums text-[var(--color-warning)]">{fmtNum(lockedHuman)}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-[10px] uppercase text-[var(--color-text-secondary)] mb-0.5">{t('balance.total')}</p>
                <p className="text-lg font-bold tabular-nums">{fmtNum(totalHuman)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDeposit(true)} disabled={isOperationInFlight}
                className="flex-1 rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-xs font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40 btn-press">
                {isOperationInFlight ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {t('common.processing')}
                  </span>
                ) : t('balance.depositBtn')}
              </button>
              <button type="button" onClick={() => setShowWithdraw(true)} disabled={availableMicro <= 0n || isOperationInFlight}
                className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 btn-press">
                {isOperationInFlight ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {t('common.processing')}
                  </span>
                ) : t('common.withdraw')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== Deposit Modal ===== */}
      {showDeposit && (
        <Modal open onClose={depositStatus === 'signing' || depositStatus === 'broadcasting' ? () => {} : resetDeposit} showCloseButton={depositStatus !== 'signing' && depositStatus !== 'broadcasting'}>
          <div className="p-5 max-w-sm w-full">
            {depositStatus === 'success' ? (
              <div className="text-center py-4 animate-fade-up">
                <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--color-success)]/15 animate-bounce-in mb-3">
                  <CheckCircle size={28} className="text-[var(--color-success)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">{t('balance.depositSuccess')}</h3>
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold mb-1 text-[var(--color-success)] animate-number-pop">
                  +{parseFloat(depositAmount).toLocaleString()} <LaunchTokenIcon size={45} />
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4 break-all font-mono">TX: {depositTxHash.slice(0, 16)}...</p>
                <button type="button" onClick={resetDeposit}
                  className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold btn-press">
                  {t('balance.collapse')}
                </button>
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

                <div className="mb-3">
                  <input type="text" inputMode="decimal" placeholder={t('balance.amountPlaceholder')} value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                </div>

                {depositError && (
                  <div className="mb-3">
                    <p className="text-xs text-[var(--color-danger)]">{depositError}</p>
                    {(depositErrorTxHash || depositTxHash) && (
                      <a
                        href={`${EXPLORER_URL}/transactions/${depositErrorTxHash ?? depositTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {t('balance.checkTxExplorer')} →
                      </a>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={resetDeposit}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">{t('common.cancel')}</button>
                  <button type="button" onClick={handleDeposit}
                    disabled={!depositAmount || parseFloat(depositAmount) <= 0 || parseFloat(depositAmount) > walletBalanceHuman}
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
        <Modal
          open
          onClose={(withdrawMutation.isPending || withdrawStatus === 'signing') ? () => {} : () => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); setWithdrawError(''); setWithdrawErrorTxHash(null); }}
          showCloseButton={!withdrawMutation.isPending && withdrawStatus !== 'signing'}
        >
          <div className="p-5 max-w-sm w-full">
            {withdrawStatus === 'success' ? (
              <div className="text-center py-4 animate-fade-up">
                <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-[var(--color-success)]/15 animate-bounce-in mb-3">
                  <CheckCircle size={28} className="text-[var(--color-success)]" />
                </div>
                <h3 className="text-lg font-bold mb-2">{t('balance.withdrawSuccess')}</h3>
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold mb-1 text-[var(--color-success)] animate-number-pop">
                  −{parseFloat(withdrawAmount || lastWithdrawHumanRef.current).toLocaleString()} <LaunchTokenIcon size={45} />
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                  {t('balance.withdrawSentDesc')}
                </p>
                <button type="button" onClick={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); setWithdrawError(''); setWithdrawErrorTxHash(null); }}
                  className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold btn-press">
                  {t('balance.collapse')}
                </button>
              </div>
            ) : withdrawStatus === 'timeout' ? (
              /* Timeout — tx likely still processing on chain */
              <div className="text-center py-4 animate-fade-up">
                <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-amber-500/15 mb-3">
                  <Shield size={28} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">
                  {t('locale') === 'ru' || locale === 'ru' ? 'Транзакция обрабатывается' : 'Transaction Processing'}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                  {locale === 'ru'
                    ? 'Ответ от блокчейна занял больше времени чем обычно, но транзакция скорее всего прошла успешно.'
                    : 'The blockchain response took longer than usual, but the transaction likely succeeded.'}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                  {locale === 'ru'
                    ? 'Баланс обновится автоматически в течение нескольких секунд.'
                    : 'Your balance will update automatically in a few seconds.'}
                </p>
                <button type="button" onClick={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); setWithdrawError(''); setWithdrawErrorTxHash(null); }}
                  className="w-full rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-black btn-press">
                  {locale === 'ru' ? 'Понятно' : 'Got it'}
                </button>
              </div>
            ) : withdrawMutation.isPending || withdrawStatus === 'signing' ? (
              <WithdrawProgressOverlay elapsedSec={withdrawElapsed} />
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">{t('balance.withdrawTitle')}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                  {t('balance.withdrawAvailable', { amount: fmtNum(availableHuman) })}
                </p>

                <div className="flex gap-2 mb-3">
                  {[0.25, 0.5, 1].map((frac) => (
                    <button key={frac} type="button"
                      onClick={() => setWithdrawAmount(String(Math.floor(availableHuman * frac)))}
                      className={`flex-1 rounded-lg py-2 text-xs font-bold border transition-colors ${
                        withdrawAmount === String(Math.floor(availableHuman * frac))
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                      }`}>
                      {frac === 1 ? t('common.max') : `${frac * 100}%`}
                    </button>
                  ))}
                </div>

                <div className="mb-4">
                  <input type="text" inputMode="decimal" placeholder={t('balance.amountPlaceholder')} value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                </div>

                {withdrawError && (
                  <div className="mb-3">
                    <p className="text-xs text-[var(--color-danger)]">{withdrawError}</p>
                    {withdrawErrorTxHash && (
                      <a
                        href={`${EXPLORER_URL}/transactions/${withdrawErrorTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {t('balance.checkTxExplorer')} →
                      </a>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowWithdraw(false); setWithdrawAmount(''); setWithdrawStatus('idle'); setWithdrawError(''); setWithdrawErrorTxHash(null); }}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">{t('common.cancel')}</button>
                  <button type="button"
                    disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > availableHuman || withdrawMutation.isPending}
                    onClick={handleWithdraw}
                    className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
                    {t('common.withdraw')}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
