'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCancelBet, cancelBet } from '@coinflip/api-client';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { useWalletContext } from '@/contexts/wallet-context';
import { BetCard } from './bet-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { Coins } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';
import type { PendingBet } from '@/hooks/use-pending-bets';
import { extractErrorPayload, isActionInProgress, getUserFriendlyError } from '@/lib/user-friendly-errors';

interface MyBetsProps {
  /** Bets submitted but not yet confirmed on chain */
  pendingBets?: PendingBet[];
}

export function MyBets({ pendingBets = [] }: MyBetsProps) {
  const { address, isConnected } = useWalletContext();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [pendingBetId, setPendingBetId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'cancel' | null>(null);

  // Smart polling: slow (30s) when WS connected, faster (15s) when WS down
  const pollInterval = () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED;

  const { data: myBetsData, isLoading, error: myBetsError } = useQuery({
    queryKey: ['/api/v1/bets/mine', address],
    queryFn: () =>
      customFetch<{ data: any[] }>({
        url: '/api/v1/bets/mine',
        method: 'GET',
      }),
    enabled: isConnected && !!address,
    refetchInterval: pollInterval,
    staleTime: 3_000,
  });

  const allBets = myBetsData?.data ?? [];

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/v1/bets/mine', address] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
  }, [queryClient, address]);

  const clearPending = useCallback(() => {
    setPendingBetId(null);
    setPendingAction(null);
  }, []);

  const cancelMutation = useCancelBet({
    mutation: {
      onSuccess: (_response: any, variables) => {
        // Don't invalidateAll — WS bet_canceled event handles cache invalidation.
        // Optimistically remove the bet from MyBets cache for instant UI update.
        const betId = String(variables.betId);
        queryClient.setQueriesData(
          { queryKey: ['/api/v1/bets/mine'] },
          (old: any) => {
            if (!old?.data) return old;
            return {
              ...old,
              data: old.data.map((b: any) =>
                String(b.id) === betId ? { ...b, status: 'canceling' } : b,
              ),
            };
          },
        );
        clearPending();
        addToast('success', t('bets.cancelingFunds'));
      },
      onError: (err: unknown) => {
        clearPending();
        // On error, DO invalidate to restore correct state
        invalidateAll();
        const { message } = extractErrorPayload(err);
        const is429 = isActionInProgress(message);
        addToast(is429 ? 'warning' : 'error', is429 ? t('bets.prevActionProcessing') : getUserFriendlyError(err, t, 'cancel'));
      },
    },
  });

  // /mine returns only my bets — no client-side filtering needed
  const addrLower = address?.toLowerCase();
  const myBets = allBets;

  const handleCancel = useCallback((id: string) => {
    setPendingBetId(id);
    setPendingAction('cancel');
    cancelMutation.mutate({ betId: Number(id) });
  }, [cancelMutation]);

  // ─── Cancel All Open Bets ───
  const [cancelAllState, setCancelAllState] = useState<{
    active: boolean;
    total: number;
    done: number;
    errors: number;
  } | null>(null);
  const cancelAllAbortRef = useRef(false);

  const handleCancelAll = useCallback(async (betIds: string[]) => {
    if (betIds.length === 0) return;
    cancelAllAbortRef.current = false;
    setCancelAllState({ active: true, total: betIds.length, done: 0, errors: 0 });

    let done = 0;
    let errors = 0;

    for (const id of betIds) {
      if (cancelAllAbortRef.current) break;
      try {
        await cancelBet(Number(id));
        done++;
      } catch {
        errors++;
      }
      setCancelAllState({ active: true, total: betIds.length, done: done + errors, errors });
      // Wait 3.5s between requests (relayer cooldown is 3s)
      if (done + errors < betIds.length && !cancelAllAbortRef.current) {
        await new Promise(r => setTimeout(r, 3500));
      }
    }

    setCancelAllState(null);
    invalidateAll();
    if (errors === 0) {
      addToast('success', t('myBets.batchCancelSuccess', { count: done }));
    } else {
      addToast('warning', t('myBets.batchCancelPartial', { count: done, errors }));
    }
  }, [invalidateAll, addToast]);

  const handleStopCancelAll = useCallback(() => {
    cancelAllAbortRef.current = true;
  }, []);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('myBets.connectToView')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
    );
  }

  if (myBetsError && !myBetsData) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] py-12">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('bets.failedToLoad')}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/v1/bets/mine'] })}
          className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-xs font-medium"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // Categorize bets (include 'canceling' with open bets so cards don't vanish instantly)
  const myOpenBets = myBets.filter(b => (b.status === 'open' || b.status === 'canceling') && b.maker?.toLowerCase() === addrLower);
  const myAccepting = myBets.filter(b => b.status === 'accepting');
  const myInProgress = myBets.filter(b => b.status === 'accepted');
  const myResolved = myBets.filter(b => b.status === 'revealed' || b.status === 'timeout_claimed' || (b.status === 'canceled' && (b as any).acceptor));

  // Track when each resolved bet was first seen client-side for smooth fade-out.
  // Server shows resolved bets for ~60s; we fade them out starting at ~50s client-side.
  const resolvedFirstSeenRef = useRef<Map<string, number>>(new Map());
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const seen = resolvedFirstSeenRef.current;
    // Register newly seen resolved bets
    for (const bet of myResolved) {
      if (!seen.has(String(bet.id))) {
        seen.set(String(bet.id), now);
      }
    }
    // Clean up bets that are no longer in the resolved list
    for (const id of seen.keys()) {
      if (!myResolved.some(b => String(b.id) === id)) {
        seen.delete(id);
      }
    }
    // Schedule re-render when oldest bet should start fading (at 50s mark)
    if (myResolved.length > 0) {
      const timer = setTimeout(() => forceRerender(n => n + 1), 5_000);
      return () => clearTimeout(timer);
    }
  }, [myResolved]);

  // Compute opacity for each resolved bet (full opacity for first 50s, fades over next 10s)
  const getResolvedOpacity = useCallback((betId: string): number => {
    const firstSeen = resolvedFirstSeenRef.current.get(betId);
    if (!firstSeen) return 1;
    const age = Date.now() - firstSeen;
    if (age < 50_000) return 1;
    if (age > 60_000) return 0;
    return 1 - (age - 50_000) / 10_000;
  }, []);

  // Filter out fully faded resolved bets
  const visibleResolved = useMemo(
    () => myResolved.filter(b => getResolvedOpacity(String(b.id)) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myResolved, forceRerender],
  );

  // Filter out pending bets that already appeared in the actual bets list (confirmed on chain)
  const confirmedTxHashes = new Set(allBets.map(b => (b as any).txhash_create).filter(Boolean));
  const myPending = pendingBets.filter(b => b.maker?.toLowerCase() === addrLower && !confirmedTxHashes.has(b.txHash));

  const hasAnything = myPending.length > 0 || myAccepting.length > 0 || myInProgress.length > 0 || myOpenBets.length > 0 || visibleResolved.length > 0;

  return (
    <div className="space-y-4">
      {/* Confirming on blockchain (just submitted, no bet_id yet) */}
      {myPending.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase text-[var(--color-primary)] mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] animate-pulse" />
            {t('myBets.submittingCount', { count: myPending.length })}
          </h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {myPending.map((bet) => (
              <div
                key={bet.txHash}
                className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4 animate-pulse"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums">{formatLaunch(bet.amount)} <LaunchTokenIcon size={50} /></span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-bold">
                    {t('myBets.submitting')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
                  <span>{t('common.confirming')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In progress: accepting or determining winner */}
      {(myAccepting.length > 0 || myInProgress.length > 0) && (
        <div>
          <h3 className="text-xs font-bold uppercase text-[var(--color-warning)] mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
            {t('myBets.inProgress', { count: myAccepting.length + myInProgress.length })}
          </h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {myAccepting.map((bet) => (
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
                isMine={bet.maker?.toLowerCase() === addrLower}
                isAcceptor={(bet as any).acceptor?.toLowerCase() === addrLower}
              />
            ))}
            {myInProgress.map((bet) => (
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
                isMine={bet.maker?.toLowerCase() === addrLower}
                isAcceptor={(bet as any).acceptor?.toLowerCase() === addrLower}
              />
            ))}
          </div>
        </div>
      )}

      {/* My open bets — waiting for opponent */}
      {myOpenBets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase text-[var(--color-text-secondary)]">
              {t('myBets.waitingForOpponent', { count: myOpenBets.length })}
            </h3>
            {myOpenBets.length > 1 && !cancelAllState && (
              <button
                type="button"
                onClick={() => handleCancelAll(myOpenBets.map(b => String(b.id)))}
                className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-1 text-[10px] font-bold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
              >
                {t('myBets.cancelAll', { count: myOpenBets.length })}
              </button>
            )}
          </div>

          {/* Cancel All progress bar */}
          {cancelAllState && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">
                  {t('myBets.cancelingBatch', { done: cancelAllState.done, total: cancelAllState.total })}
                  {cancelAllState.errors > 0 && (
                    <span className="text-[var(--color-danger)] ml-1">{t('wager.errorsCount', { errors: cancelAllState.errors })}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleStopCancelAll}
                  className="text-[10px] font-bold text-[var(--color-danger)] hover:underline"
                >
                  {t('common.stop')}
                </button>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-danger)] transition-all duration-300"
                  style={{ width: `${(cancelAllState.done / cancelAllState.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {myOpenBets.map((bet) => (
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
                isMine
                pendingBetId={pendingBetId}
                pendingAction={pendingAction}
                onCancel={cancelAllState ? undefined : handleCancel}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recently resolved — show result with smooth fade-out */}
      {visibleResolved.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase text-[var(--color-text-secondary)] mb-2">
            {t('myBets.recentResults') ?? `Results (${visibleResolved.length})`}
          </h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {visibleResolved.map((bet) => {
              const winner = (bet as any).winner?.toLowerCase();
              const isWinner = winner === addrLower;
              const isRevealed = bet.status === 'revealed' || bet.status === 'timeout_claimed';
              const payout = isRevealed && isWinner
                ? formatLaunch(String(BigInt(bet.amount) * 2n * 9n / 10n))
                : null;
              const opacity = getResolvedOpacity(String(bet.id));
              return (
                <div
                  key={bet.id}
                  style={{ opacity }}
                  className={`rounded-2xl border p-4 transition-opacity duration-[2000ms] ${
                    isRevealed
                      ? isWinner
                        ? 'border-green-500/40 bg-green-500/10'
                        : 'border-red-500/40 bg-red-500/10'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums">
                      {formatLaunch(bet.amount)} <LaunchTokenIcon size={50} />
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      isRevealed
                        ? isWinner
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {isRevealed
                        ? isWinner ? (t('game.youWon') ?? 'WIN') : (t('game.youLost') ?? 'LOSS')
                        : (t('common.canceled') ?? 'Canceled')}
                    </span>
                  </div>
                  {isRevealed && (
                    <p className={`text-sm font-bold ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                      {isWinner ? `+${payout} LAUNCH` : `-${formatLaunch(bet.amount)} LAUNCH`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasAnything && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mx-auto mb-3">
            <Coins size={32} strokeWidth={1.5} />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">{t('myBets.noActiveBets')}</p>
          <p className="text-xs text-[var(--color-text-secondary)]/60">{t('myBets.createToStart')}</p>
        </div>
      )}
    </div>
  );
}
