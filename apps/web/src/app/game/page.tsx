'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { useQueryClient } from '@tanstack/react-query';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
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
  const [wsBannerDismissed, setWsBannerDismissed] = useState(false);
  const queryClient = useQueryClient();
  const { address, isConnected } = useWalletContext();
  const { addToast } = useToast();
  const { t } = useTranslation();

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users'] }),
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

    if (event.type === 'bet_confirmed') {
      // Only show to the maker who created the bet
      if (addr && data?.maker?.toLowerCase() === addr) {
        addToast('success', t('game.betConfirmed'));
      }
    }
    if (event.type === 'bet_create_failed') {
      // Targeted event — only sent to the maker's address
      const reason = data?.reason ?? 'Transaction failed';
      addToast('error', getUserFriendlyError({ error: { message: reason } }, t, 'create'));
    }
    if (event.type === 'bet_accepted') {
      // Only show to maker and acceptor
      if (isMyBet) {
        addToast('info', t('game.betAcceptedWinner'));
      }
    }
    if (event.type === 'accept_failed') {
      // Targeted event — only sent to the acceptor's address
      const reason = data?.reason ?? 'Transaction failed';
      addToast('error', getUserFriendlyError({ error: { message: reason } }, t, 'accept'));
    }
    if (event.type === 'bet_reverted') {
      // Only show to maker and acceptor (not everyone watching)
      if (isMyBet) {
        addToast('info', t('game.betReverted'));
      }
    }
    if (event.type === 'bet_revealed') {
      if (!isMyBet) return;
      const winner = data?.winner?.toLowerCase();
      const isWinner = winner && addr === winner;
      addToast(isWinner ? 'success' : 'warning', isWinner ? t('game.youWon') : t('game.youLost'));
    }
  }, [handlePendingWsEvent, addToast, address, t]);

  const { isConnected: wsConnected } = useWebSocket({ address, enabled: isConnected, onEvent: handleWsEvent });

  // Reset dismiss when ws reconnects, auto-dismiss after 5s
  useEffect(() => {
    if (wsConnected) setWsBannerDismissed(false);
  }, [wsConnected]);

  useEffect(() => {
    if (!isConnected || wsConnected || wsBannerDismissed) return;
    const timer = setTimeout(() => setWsBannerDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [isConnected, wsConnected, wsBannerDismissed]);

  const showWsBanner = isConnected && !wsConnected && !wsBannerDismissed;

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

      <div id="create-bet-form">
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
              onClick={() => setWsBannerDismissed(true)}
              className="shrink-0 rounded-md p-0.5 hover:bg-[var(--color-warning)]/20 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
