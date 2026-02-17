'use client';

import { useState, useCallback, useRef } from 'react';
import { useGetBets, useCancelBet, cancelBet } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { BetCard } from './bet-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { Coins } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { PendingBet } from '@/hooks/use-pending-bets';

/** Extract error message, handling 429 action-in-progress specially */
function extractError(err: unknown): { msg: string; is429: boolean } {
  const msg = err instanceof Error ? err.message
    : typeof err === 'object' && err && 'message' in err
      ? String((err as { message: string }).message)
      : 'Unknown error';
  const is429 = msg.includes('still processing') || msg.includes('ACTION_IN_PROGRESS');
  return { msg, is429 };
}

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

  // Get all active bets
  // Fetch open bets (includes "canceling" from DB since it's set before chain confirms)
  const { data: openData, isLoading: loadingOpen } = useGetBets(
    { status: 'open', limit: 50 },
    { query: { enabled: isConnected, refetchInterval: 5_000 } },
  );
  const { data: acceptingData, isLoading: loadingAccepting } = useGetBets(
    { status: 'accepting', limit: 50 },
    { query: { enabled: isConnected, refetchInterval: 5_000 } },
  );
  const { data: acceptedData, isLoading: loadingAccepted } = useGetBets(
    { status: 'accepted' as any, limit: 50 },
    { query: { enabled: isConnected, refetchInterval: 5_000 } },
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
  }, [queryClient]);

  const clearPending = useCallback(() => {
    setPendingBetId(null);
    setPendingAction(null);
  }, []);

  const cancelMutation = useCancelBet({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        clearPending();
        addToast('success', t('bets.cancelingFunds'));
      },
      onError: (err: unknown) => {
        clearPending();
        invalidateAll();
        const { msg, is429 } = extractError(err);
        addToast(is429 ? 'warning' : 'error', is429 ? t('bets.prevActionProcessing') : t('bets.cancelError', { msg }));
      },
    },
  });

  const isLoading = loadingOpen || loadingAccepting || loadingAccepted;
  const allBets = [...(openData?.data ?? []), ...(acceptingData?.data ?? []), ...(acceptedData?.data ?? [])];

  // Filter to only my bets
  const myBets = allBets.filter(
    (bet) => bet.maker === address || (bet as any).acceptor === address,
  );

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

  // Categorize bets
  const myOpenBets = myBets.filter(b => b.status === 'open' && b.maker === address);
  const myAccepting = myBets.filter(b => b.status === 'accepting' && ((b as any).acceptor === address || b.maker === address));
  const myInProgress = myBets.filter(b => b.status === 'accepted');
  // Filter out pending bets that already appeared in the actual bets list (confirmed on chain)
  const confirmedTxHashes = new Set(allBets.map(b => (b as any).txhash_create).filter(Boolean));
  const myPending = pendingBets.filter(b => b.maker === address && !confirmedTxHashes.has(b.txHash));

  const hasAnything = myPending.length > 0 || myAccepting.length > 0 || myInProgress.length > 0 || myOpenBets.length > 0;

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
                isMine={bet.maker === address}
                isAcceptor={(bet as any).acceptor === address}
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
                isMine={bet.maker === address}
                isAcceptor={(bet as any).acceptor === address}
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
