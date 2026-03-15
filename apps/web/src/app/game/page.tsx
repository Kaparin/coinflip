'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSwipeable } from 'react-swipeable';
import { useQueryClient } from '@tanstack/react-query';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { CreateBetFab } from '@/components/features/bets/create-bet-fab';
import { BetList } from '@/components/features/bets/bet-list';
import { MyBets } from '@/components/features/bets/my-bets';
import { HistoryList } from '@/components/features/history/history-list';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { Leaderboard } from '@/components/features/leaderboard/leaderboard';
import { TopWinnerBanner } from '@/components/features/top-winner-banner';
import { JackpotBanner } from '@/components/features/jackpot/jackpot-banner';
import { TgWelcomeBanner } from '@/components/features/telegram/tg-welcome-banner';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { GameLeftPanel } from '@/components/features/game/game-left-panel';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWebSocketContext } from '@/contexts/websocket-context';
import { useNotifications } from '@/components/features/notifications/notification-provider';
import { usePendingBets } from '@/hooks/use-pending-bets';
import { useActiveDuels } from '@/hooks/use-active-duels';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from '@/lib/i18n';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';
import { JackpotWinnerReveal } from '@/components/features/jackpot/jackpot-winner-reveal';
import { X } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import type { WsEvent } from '@coinflip/shared/types';

type Tab = 'bets' | 'mybets' | 'history' | 'leaderboard';

const TAB_ORDER: Tab[] = ['bets', 'mybets', 'history', 'leaderboard'];

export default function GamePage() {
  const [activeTab, setActiveTab] = useState<Tab>('bets');
  const activeTabRef = useRef<Tab>('bets');
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['bets']));
  const [showWsBanner, setShowWsBanner] = useState(false);
  const [eventNotification, setEventNotification] = useState<{ message: string; variant: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const [jackpotWinner, setJackpotWinner] = useState<{
    tierName: string;
    amount: string;
    winnerAddress: string;
    winnerNickname: string | null;
  } | null>(null);
  const queryClient = useQueryClient();
  const { address, isConnected } = useWalletContext();
  const { addToast } = useToast();
  const { t } = useTranslation();

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events/active'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events/completed'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/jackpot/active'] }),
    ]);
  }, [queryClient]);

  const { pendingBets, addPending, handleWsEvent: handlePendingWsEvent } = usePendingBets();
  const { duels, handleWsEvent: handleDuelWsEvent } = useActiveDuels();

  const { handleWsEvent: handleNotificationEvent } = useNotifications();

  const handleWsEvent = useCallback((event: WsEvent) => {
    handlePendingWsEvent(event);
    handleDuelWsEvent(event);
    handleNotificationEvent(event);

    const data = event.data as any;
    const addr = address?.toLowerCase();
    // Check if current user is involved in this bet (maker or acceptor)
    const isMyBet = addr && (
      data?.maker?.toLowerCase() === addr ||
      data?.acceptor?.toLowerCase() === addr
    );

    // Skip stale events — don't show toasts for events older than 30s.
    // This prevents a flood of "You won!"/"You lost" when reconnecting after being offline.
    const eventAge = event.timestamp ? Date.now() - event.timestamp : 0;
    const isStale = eventAge > 30_000;

    if (event.type === 'bet_confirmed') {
      // Only show to the maker who created the bet
      if (!isStale && addr && data?.maker?.toLowerCase() === addr) {
        addToast('success', t('game.betConfirmed'));
      }
    }
    if (event.type === 'bet_create_failed') {
      // Targeted event — only sent to the maker's address (always show errors)
      const reason = data?.reason ?? 'Transaction failed';
      addToast('error', getUserFriendlyError({ error: { message: reason } }, t, 'create'));
    }
    if (event.type === 'bet_accepted') {
      // Only show to maker and acceptor
      if (!isStale && isMyBet) {
        addToast('info', t('game.betAcceptedWinner'));
      }
    }
    if (event.type === 'accept_failed') {
      // Targeted event — only sent to the acceptor's address (always show errors)
      const reason = data?.reason ?? 'Transaction failed';
      addToast('error', getUserFriendlyError({ error: { message: reason } }, t, 'accept'));
    }
    if (event.type === 'bet_reverted') {
      // Only show to maker and acceptor (not everyone watching)
      if (!isStale && isMyBet) {
        addToast('info', t('game.betReverted'));
      }
    }
    if (event.type === 'bet_revealed') {
      if (!isMyBet || isStale) return;
    }

    // Event lifecycle notifications
    if (event.type === 'event_started') {
      const title = data?.title ?? '';
      setEventNotification({ message: t('events.notifications.started', { title }), variant: 'success' });
    }
    if (event.type === 'event_ended') {
      const title = data?.title ?? '';
      setEventNotification({ message: t('events.notifications.ended', { title }), variant: 'info' });
    }
    if (event.type === 'event_results_published') {
      const title = data?.title ?? '';
      setEventNotification({ message: t('events.notifications.resultsPublished', { title }), variant: 'success' });
    }
    if (event.type === 'event_canceled') {
      const title = data?.title ?? '';
      setEventNotification({ message: t('events.notifications.canceled', { title }), variant: 'error' });
    }

    // Deposit notifications (async mode) — emitDepositEvent now handled globally in use-websocket.ts
    if (event.type === 'deposit_confirmed') {
      addToast('success', t('balance.depositConfirmedWs'));
    }
    if (event.type === 'deposit_failed') {
      const reason = String(data?.reason ?? '');
      addToast('error', t('balance.depositFailedWs', { reason }));
    }

    // Tournament score update — personal notification (server sends only to the player)
    if (event.type === 'tournament_score_update') {
      if (!isStale) {
        const points = data?.points ?? 0;
        const reason = data?.reason === 'win' ? '🏆' : '🎯';
        if (Number(points) > 0) {
          addToast('success', `${reason} +${points} ${t('tournament.points')}`);
        }
      }
    }

    // Tournament lifecycle notifications
    if (event.type === 'tournament_started') {
      const title = data?.title ?? '';
      setEventNotification({ message: `⚔️ ${t('tournament.notifications.started')} — ${title}`, variant: 'success' });
    }
    if (event.type === 'tournament_ended') {
      const title = data?.title ?? '';
      setEventNotification({ message: `${t('tournament.notifications.ended')} — ${title}`, variant: 'info' });
    }
    if (event.type === 'tournament_results') {
      const title = data?.title ?? '';
      setEventNotification({ message: `🏆 ${t('tournament.notifications.results')} — ${title}`, variant: 'success' });
    }
    if (event.type === 'tournament_notification') {
      const notifType = data?.notificationType;
      if (notifType === 'registration_closing') {
        setEventNotification({ message: `⏰ ${t('tournament.notifications.registrationClosing')}`, variant: 'warning' });
      } else if (notifType === 'ending_soon') {
        setEventNotification({ message: `⏰ ${t('tournament.notifications.endingSoon')}`, variant: 'warning' });
      } else if (notifType === 'last_day') {
        setEventNotification({ message: `🔥 ${t('tournament.notifications.lastDay')}`, variant: 'warning' });
      }
    }

    // Jackpot winner — show rich overlay with tier image
    if (event.type === 'jackpot_won') {
      setJackpotWinner({
        tierName: String(data?.tierName ?? ''),
        amount: String(data?.amount ?? '0'),
        winnerAddress: String(data?.winnerAddress ?? ''),
        winnerNickname: data?.winnerNickname ? String(data.winnerNickname) : null,
      });
    }
  }, [handlePendingWsEvent, handleDuelWsEvent, handleNotificationEvent, addToast, address, t]);

  // Subscribe to WS events from the layout-level WebSocket provider
  const { isConnected: wsConnected, subscribe: subscribeWs } = useWebSocketContext();

  useEffect(() => {
    return subscribeWs(handleWsEvent);
  }, [subscribeWs, handleWsEvent]);

  // Show WS banner only after sustained disconnection (3s delay).
  useEffect(() => {
    if (wsConnected || !isConnected) {
      setShowWsBanner(false);
      return;
    }
    const timer = setTimeout(() => setShowWsBanner(true), 3000);
    return () => clearTimeout(timer);
  }, [wsConnected, isConnected]);

  // Auto-dismiss event notification after 5 seconds
  useEffect(() => {
    if (!eventNotification) return;
    const timer = setTimeout(() => setEventNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [eventNotification]);

  const handleTabChange = useCallback((tab: Tab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const setTabByDelta = useCallback((delta: number) => {
    const currentIdx = TAB_ORDER.indexOf(activeTabRef.current);
    const next = Math.max(0, Math.min(TAB_ORDER.length - 1, currentIdx + delta));
    const tab = TAB_ORDER[next];
    if (tab) handleTabChange(tab);
  }, [handleTabChange]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bets', label: t('game.openBets') },
    { id: 'mybets', label: t('game.myBets') },
    { id: 'history', label: t('game.historyTab') },
    { id: 'leaderboard', label: t('game.topPlayers') },
  ];

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => setTabByDelta(1),
    onSwipedRight: () => setTabByDelta(-1),
    trackMouse: false,
    delta: 50,
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="h-full flex">
      {/* ═══ Left Panel — xl+ only ═══ */}
      <GameLeftPanel />

      {/* ═══ Center Game Area ═══ */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 lg:px-5 py-4 pb-24 md:pb-6 space-y-4" data-section="game">
        <TgWelcomeBanner />

        {/* Banners — hidden on xl+ (shown in left panel instead) */}
        <div className="xl:hidden space-y-3">
          <div className="hidden md:block">
            <BalanceDisplay />
          </div>
          <TopWinnerBanner />
          <JackpotBanner />
        </div>

        <div id="create-bet-form" className="hidden md:block">
          <CreateBetForm onBetSubmitted={(bet) => { addPending(bet); handleTabChange('mybets'); }} />
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 border-b border-[var(--color-border)] mb-3 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px active:scale-[0.98] ${
                  activeTab === tab.id
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div {...swipeHandlers} className="min-h-[200px]">
            <div style={{ display: activeTab === 'bets' ? 'block' : 'none' }}>
              <BetList pendingBets={pendingBets} activeDuels={duels} />
            </div>
            {visitedTabs.has('mybets') && (
              <div style={{ display: activeTab === 'mybets' ? 'block' : 'none' }}>
                <MyBets pendingBets={pendingBets} />
              </div>
            )}
            {visitedTabs.has('history') && (
              <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
                <HistoryList />
              </div>
            )}
            {visitedTabs.has('leaderboard') && (
              <div style={{ display: activeTab === 'leaderboard' ? 'block' : 'none' }}>
                <Leaderboard />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Jackpot winner overlay */}
      {jackpotWinner && (
        <JackpotWinnerReveal
          tierName={jackpotWinner.tierName}
          amount={jackpotWinner.amount}
          winnerAddress={jackpotWinner.winnerAddress}
          winnerNickname={jackpotWinner.winnerNickname}
          onClose={() => setJackpotWinner(null)}
        />
      )}

      {/* Event notification banner — fixed bottom, auto-dismiss */}
      {eventNotification && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-2xl animate-fade-up">
          <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur-sm ${
            eventNotification.variant === 'success'
              ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]'
              : eventNotification.variant === 'error'
                ? 'bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30 text-[var(--color-danger)]'
                : eventNotification.variant === 'warning'
                  ? 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30 text-[var(--color-warning)]'
                  : 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]'
          }`}>
            <span className="font-medium">{eventNotification.message}</span>
            <button
              type="button"
              onClick={() => setEventNotification(null)}
              className="shrink-0 rounded-md p-0.5 hover:opacity-70 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* WebSocket reconnecting banner — fixed bottom, auto-dismiss */}
      {showWsBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-2xl animate-fade-up">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 px-3 py-2 text-xs text-[var(--color-warning)] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-warning)] animate-pulse" />
              {t('game.reconnecting')}
            </div>
            <button
              type="button"
              onClick={() => setShowWsBanner(false)}
              className="shrink-0 rounded-md p-0.5 hover:bg-[var(--color-warning)]/20 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <CreateBetFab onBetSubmitted={(bet) => { addPending(bet); handleTabChange('mybets'); }} />
    </PullToRefresh>
  );
}
