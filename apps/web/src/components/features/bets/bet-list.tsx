'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useGetBets, useAcceptBet, useCancelBet, useGetVaultBalance } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { BetCard } from './bet-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  fromMicroLaunch,
  formatLaunch,
  COMMISSION_BPS,
  LAUNCH_MULTIPLIER,
} from '@coinflip/shared/constants';
import { extractErrorPayload, isActionInProgress, isBetCanceled, isBetClaimed, isBetGone, getUserFriendlyError } from '@/lib/user-friendly-errors';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { LaunchTokenIcon } from '@/components/ui';
import { Coins } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';
import type { PendingBet } from '@/hooks/use-pending-bets';

type AmountFilter = 'all' | 'low' | 'mid' | 'high';

function extractError(err: unknown): { msg: string; is429: boolean; isCanceled: boolean; isClaimed: boolean; isGone: boolean } {
  const { message: msg } = extractErrorPayload(err);
  return {
    msg: msg || 'Unknown error',
    is429: isActionInProgress(msg),
    isCanceled: isBetCanceled(msg),
    isClaimed: isBetClaimed(msg),
    isGone: isBetGone(msg),
  };
}

const AMOUNT_FILTERS: { value: AmountFilter; label: string; min: number; max: number }[] = [
  { value: 'all', label: 'All', min: 0, max: Infinity },
  { value: 'low', label: '1-10', min: 1 * LAUNCH_MULTIPLIER, max: 10 * LAUNCH_MULTIPLIER },
  { value: 'mid', label: '10-100', min: 10 * LAUNCH_MULTIPLIER, max: 100 * LAUNCH_MULTIPLIER },
  { value: 'high', label: '100+', min: 100 * LAUNCH_MULTIPLIER, max: Infinity },
];

interface BetListProps {
  pendingBets?: PendingBet[];
}

export function BetList({ pendingBets = [] }: BetListProps) {
  const [amountFilter, setAmountFilter] = useState<AmountFilter>('all');
  const [acceptTarget, setAcceptTarget] = useState<{ id: string; amount: number } | null>(null);
  const [pendingBetId, setPendingBetId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'cancel' | 'accept' | null>(null);

  const { address, isConnected } = useWalletContext();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  // Smart polling: 30s when WS connected (rare fallback), 15s when WS down.
  // retry: 3 with exponential backoff prevents transient errors (rate limits) from breaking the page.
  // keepPreviousData equivalent: placeholderData keeps stale data visible during error/refetch.
  const { data, isLoading, isFetching, error, refetch } = useGetBets(
    { status: 'open', limit: 50 },
    {
      query: {
        refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
    },
  );
  const vaultKey = ['/api/v1/vault/balance'];
  const { pendingDeduction, addDeduction, removeDeduction } = usePendingBalance();
  // Use WS-aware shared balance query (no dedicated polling — WS events + main balance handle it)
  const { data: balanceData } = useGetVaultBalance({
    query: {
      enabled: isConnected,
      refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    },
  });
  const rawAvailableMicro = BigInt(balanceData?.data?.available ?? '0');
  const availableMicro = rawAvailableMicro - pendingDeduction < 0n ? 0n : rawAvailableMicro - pendingDeduction;

  // Map betId → deductionId for accept deductions
  const acceptDeductionRef = useRef<Map<string, string>>(new Map());

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
  }, [queryClient]);

  const clearPending = useCallback(() => {
    setPendingBetId(null);
    setPendingAction(null);
  }, []);

  // Track recently accepted bet IDs to disable their buttons temporarily
  const [recentlyAcceptedIds, setRecentlyAcceptedIds] = useState<Set<string>>(new Set());

  const cancelMutation = useCancelBet({
    mutation: {
      onSuccess: () => {
        // Don't invalidateAll here — WS bet_canceled event handles cache invalidation.
        // Only clear local pending state to avoid double refetch + flicker.
        clearPending();
        addToast('success', t('bets.cancelingFunds'));
      },
      onError: (err: unknown) => {
        clearPending();
        // On error, DO invalidate to restore correct state
        invalidateAll();
        const { is429 } = extractError(err);
        const friendlyMsg = getUserFriendlyError(err, t, 'cancel');
        addToast(is429 ? 'warning' : 'error', is429 ? t('bets.prevActionProcessing') : friendlyMsg);
      },
    },
  });

  const acceptMutation = useAcceptBet({
    mutation: {
      onSuccess: (response: any, variables) => {
        const betId = String(variables.betId);

        const deductionId = acceptDeductionRef.current.get(betId);
        if (deductionId) {
          removeDeduction(deductionId);
          acceptDeductionRef.current.delete(betId);
        }

        // Apply server balance from 202 response immediately via setQueryData
        // This is always safe — the server computed it with pending locks accounted for.
        const serverBalance = response?.balance;
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

        // Optimistically remove the accepted bet from the open bets cache
        // so the card disappears instantly without waiting for WS + refetch.
        queryClient.setQueriesData(
          { queryKey: ['/api/v1/bets'] },
          (old: any) => {
            if (!old?.data) return old;
            return {
              ...old,
              data: old.data.filter((b: any) => String(b.id) !== betId),
            };
          },
        );

        // Instantly add the bet to my-bets cache so it appears in "My Bets"
        // without waiting for the debounced WS refetch (~1.5s gap).
        // Server returns the full bet object with status='accepting' + acceptor set.
        const betData = response?.data;
        if (betData) {
          queryClient.setQueriesData(
            { queryKey: ['/api/v1/bets/mine'] },
            (old: any) => {
              if (!old?.data) return { data: [betData] };
              const exists = old.data.some((b: any) => String(b.id) === betId);
              if (exists) {
                return { ...old, data: old.data.map((b: any) =>
                  String(b.id) === betId ? { ...b, ...betData } : b,
                ) };
              }
              return { ...old, data: [betData, ...old.data] };
            },
          );
        }

        // Don't call invalidateQueries — WS events (bet_accepting, bet_revealed)
        // will handle the full cache refresh. This avoids triple-refetch flicker.
        setAcceptTarget(null);
        // Note: don't call clearPending() here — accept doesn't set pendingBetId,
        // and clearing it would interfere with any concurrent cancel operation.
        addToast('success', t('bets.betAccepted'));
      },
      onError: (err: unknown, variables) => {
        const betId = variables?.betId ? String(variables.betId) : null;

        // Revert the pending deduction
        if (betId) {
          const deductionId = acceptDeductionRef.current.get(betId);
          if (deductionId) {
            removeDeduction(deductionId);
            acceptDeductionRef.current.delete(betId);
          }
        }

        // Note: don't call clearPending() — accept doesn't set pendingBetId.
        setAcceptTarget(null);
        // Remove from recently accepted so button re-appears
        if (betId) {
          setRecentlyAcceptedIds(prev => {
            const next = new Set(prev);
            next.delete(betId);
            return next;
          });
        }
        const { is429, isCanceled, isClaimed, isGone } = extractError(err);
        if (isCanceled || isGone) {
          addToast('warning', t('bets.betUnavailable'));
          invalidateAll();
        } else if (isClaimed) {
          addToast('warning', t('bets.betTakenByOther'));
          invalidateAll();
        } else if (is429) {
          addToast('warning', t('bets.prevActionWait'));
        } else {
          addToast('error', getUserFriendlyError(err, t, 'accept'));
          invalidateAll();
        }
      },
    },
  });

  const bets = data?.data ?? [];

  // Filter pending bets for current user, excluding already-confirmed ones
  const confirmedTxHashes = useMemo(() => new Set(bets.map((b: any) => b.txhash_create).filter(Boolean)), [bets]);
  const myPendingBets = useMemo(
    () => pendingBets.filter(b => b.maker === address && !confirmedTxHashes.has(b.txHash)),
    [pendingBets, address, confirmedTxHashes],
  );

  const filteredBets = useMemo(() => {
    const range = AMOUNT_FILTERS.find((f) => f.value === amountFilter)!;
    const now = Date.now();
    return bets.filter((bet) => {
      // Hide own bets from Open Bets — they are managed in My Bets tab
      if (bet.maker === address) return false;
      // Hide expired bets (past their expiry time)
      const expiresAt = (bet as any).expires_at;
      if (expiresAt && new Date(expiresAt).getTime() <= now) return false;
      const amount = Number(bet.amount);
      return amount >= range.min && amount <= range.max;
    });
  }, [bets, amountFilter, address]);

  const handleAcceptClick = useCallback((id: string) => {
    const bet = bets.find(b => String(b.id) === id);
    if (bet) setAcceptTarget({ id, amount: Number(bet.amount) });
  }, [bets]);

  // Extract stable references to avoid re-creating callbacks on every render
  const cancelBet = cancelMutation.mutate;
  const acceptBetAsync = acceptMutation.mutateAsync;

  // Sequential accept queue — prevents broadcast queue pileup on the server.
  // Without this, rapid accepts fire N parallel API calls, each waiting for the
  // relayer's broadcast lock (~2-3s per tx), causing later requests to timeout.
  const acceptQueueRef = useRef<Promise<void>>(Promise.resolve());

  const handleCancelClick = useCallback((id: string) => {
    setPendingBetId(id);
    setPendingAction('cancel');
    cancelBet({ betId: Number(id) });
  }, [cancelBet]);

  const handleConfirmAccept = useCallback(() => {
    if (!acceptTarget) return;
    const betId = acceptTarget.id;

    // Optimistically deduct balance immediately (not a bet-create, so isBetCreate=false)
    const deductionId = addDeduction(String(acceptTarget.amount), false);
    acceptDeductionRef.current.set(betId, deductionId);

    // Don't set pendingBetId for accepts — it blocks ALL accept buttons via isAnyPending.
    // recentlyAcceptedIds handles per-bet blocking (hides button, shows "Accepting..." spinner).
    // This allows the user to rapidly accept multiple bets without waiting.
    setRecentlyAcceptedIds(prev => new Set(prev).add(betId));

    // Close modal immediately so user can accept more bets
    setAcceptTarget(null);

    // Queue the API call — processes one at a time to avoid overwhelming
    // the relayer's broadcast queue (which serializes all chain transactions).
    // Without this, N parallel requests each wait ~2-3s for the broadcast lock,
    // causing later requests to timeout (45s frontend limit).
    acceptQueueRef.current = acceptQueueRef.current.then(async () => {
      try {
        await acceptBetAsync({
          betId: Number(betId),
          data: { guess: 'heads' }, // server ignores this, picks randomly
        });
      } catch {
        // Error already handled by mutation's onError callback
      }
    });
  }, [acceptTarget, acceptBetAsync, addDeduction]);

  if (isLoading) {
    return (
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  // Only show error UI if we have NO cached data at all.
  // If we have stale data + error (e.g. from a transient 429), keep showing stale data
  // with a subtle retry indicator — never block the whole page.
  if (error && !data?.data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] py-12">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('bets.failedToLoad')}</p>
        <button onClick={() => void refetch()} className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-xs font-medium">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const acceptHumanAmount = acceptTarget ? fromMicroLaunch(acceptTarget.amount) : 0;
  const acceptWinAmount = acceptHumanAmount * 2 * (1 - COMMISSION_BPS / 10000);
  const hasEnoughBalance = acceptTarget ? availableMicro >= BigInt(acceptTarget.amount) : true;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {AMOUNT_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setAmountFilter(filter.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] ${
              amountFilter === filter.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {filter.value === 'all' ? t('bets.all') : filter.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
          {filteredBets.length !== 1 ? t('bets.count', { count: filteredBets.length }) : t('bets.countSingular', { count: filteredBets.length })}
        </span>
      </div>

      {/* Pending bet cards (submitted but not yet confirmed on chain) */}
      {myPendingBets.length > 0 && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 mb-2">
          {myPendingBets.map((bet) => (
            <div
              key={bet.txHash}
              className="relative rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-surface)] p-3 overflow-hidden animate-fade-up"
            >
              {/* Shimmer sweep */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold tabular-nums">{formatLaunch(bet.amount)}</span>
                    <LaunchTokenIcon size={40} />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-bold uppercase tracking-wide">
                    {t('bets.sending')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
                  <span>{t('bets.confirmingOnChain')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bets grid */}
      {filteredBets.length > 0 ? (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
          {filteredBets.map((bet, idx) => {
            const isMyBet = bet.maker === address;
            const isRecentlyAccepted = recentlyAcceptedIds.has(String(bet.id));
            return (
              <BetCard
                key={bet.id}
                id={String(bet.id)}
                maker={bet.maker}
                makerNickname={(bet as any).maker_nickname}
                amount={Number(bet.amount)}
                status={bet.status}
                createdAt={new Date(bet.created_at)}
                revealDeadline={(bet as any).reveal_deadline}
                expiresAt={(bet as any).expires_at}
                acceptedAt={(bet as any).accepted_at}
                winner={(bet as any).winner}
                acceptor={(bet as any).acceptor}
                makerVipTier={(bet as any).maker_vip_tier}
                isBoosted={(bet as any).is_boosted}
                isPinned={(bet as any).is_pinned}
                pinSlot={(bet as any).pin_slot}
                index={idx}
                isMine={isMyBet}
                pendingBetId={pendingBetId}
                pendingAction={pendingAction}
                isAccepting={isRecentlyAccepted}
                onAccept={isMyBet || isRecentlyAccepted ? undefined : handleAcceptClick}
                onCancel={isMyBet ? handleCancelClick : undefined}
              />
            );
          })}
        </div>
      ) : myPendingBets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Coins size={32} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t('bets.noOpenBets')}</p>
        </div>
      ) : null}

      {/* Accept confirmation modal */}
      {acceptTarget && (
        <Modal open onClose={() => setAcceptTarget(null)}>
          <div className="p-5 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-3">{t('bets.acceptBetTitle')}</h3>
            <div className="rounded-xl bg-[var(--color-bg)] p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">{t('wager.wagerLabel')}</span>
                <span className="flex items-center gap-1.5 font-bold">{acceptHumanAmount.toLocaleString()} LAUNCH</span>
              </div>
              <div className="border-t border-[var(--color-border)]" />
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">{t('wager.ifYouWin')}</span>
                <span className="flex items-center gap-1.5 font-bold text-[var(--color-success)]">+{acceptWinAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} <LaunchTokenIcon size={40} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">{t('wager.winChance')}</span>
                <span className="font-bold">{t('wager.winChanceValue')}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setAcceptTarget(null)}
                className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">
                {t('common.cancel')}
              </button>
              <button type="button" disabled={acceptMutation.isPending || !hasEnoughBalance} onClick={handleConfirmAccept}
                className="flex-1 rounded-xl bg-[var(--color-success)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {acceptMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {t('bets.acceptingBtn')}
                  </span>
                ) : t('bets.acceptBetBtn')}
              </button>
            </div>

            {!hasEnoughBalance && (
              <p className="mt-3 text-xs text-[var(--color-warning)] text-center">
                {t('bets.insufficientForAccept', { amount: acceptHumanAmount.toLocaleString(), available: fromMicroLaunch(availableMicro).toLocaleString() })}
              </p>
            )}

            {acceptMutation.isError && (
              <p className="mt-3 text-xs text-[var(--color-danger)] text-center">{t('bets.failedToAccept')}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
