'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { useQueryClient } from '@tanstack/react-query';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { CreateBetFab } from '@/components/features/bets/create-bet-fab';
import { BetList } from '@/components/features/bets/bet-list';
import { MyBets } from '@/components/features/bets/my-bets';
import { HistoryList } from '@/components/features/history/history-list';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { MobileBalanceBar } from '@/components/features/vault/mobile-balance-bar';
import { Leaderboard } from '@/components/features/leaderboard/leaderboard';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWebSocket } from '@/hooks/use-websocket';
import { usePendingBets } from '@/hooks/use-pending-bets';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from '@/lib/i18n';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';
import { X } from 'lucide-react';
import type { WsEvent } from '@coinflip/shared/types';

type Tab = 'bets' | 'mybets' | 'history' | 'leaderboard';

const TAB_ORDER: Tab[] = ['bets', 'mybets', 'history', 'leaderboard'];

export default function GamePage() {
  const [activeTab, setActiveTab] = useState<Tab>('bets');
  const activeTabRef = useRef<Tab>('bets');
  const [showWsBanner, setShowWsBanner] = useState(false);
  const [eventNotification, setEventNotification] = useState<{ message: string; variant: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const queryClient = useQueryClient();
  const { address, isConnected } = useWalletContext();
  const { addToast } = useToast();
  const { t } = useTranslation();

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events/active'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events/completed'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events'] }),
    ]);
  }, [queryClient]);

  const { pendingBets, addPending, handleWsEvent: handlePendingWsEvent } = usePendingBets();

  const handleWsEvent = useCallback((event: WsEvent) => {
    handlePendingWsEvent(event);

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
  }, [handlePendingWsEvent, addToast, address, t]);

  const { isConnected: wsConnected } = useWebSocket({ address, enabled: isConnected, onEvent: handleWsEvent });

  // Show WS banner only after sustained disconnection (3s delay).
  // Prevents brief flash on page navigation when hook remounts.
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
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24 md:pb-6">
      <MobileBalanceBar />
      <div className="hidden md:block">
        <BalanceDisplay />
      </div>

      <div id="create-bet-form" className="hidden md:block">
        <CreateBetForm onBetSubmitted={addPending} />
      </div>

      {/* Tabs — all always mounted, hidden via CSS to preserve state & scroll */}
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
            <BetList pendingBets={pendingBets} />
          </div>
          <div style={{ display: activeTab === 'mybets' ? 'block' : 'none' }}>
            <MyBets pendingBets={pendingBets} />
          </div>
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
            <HistoryList />
          </div>
          <div style={{ display: activeTab === 'leaderboard' ? 'block' : 'none' }}>
            <Leaderboard />
          </div>
        </div>
      </div>
    </div>

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

      <CreateBetFab onBetSubmitted={addPending} />
    </PullToRefresh>
  );
}
