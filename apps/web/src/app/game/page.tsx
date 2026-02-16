'use client';

import { useState, useCallback } from 'react';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { BetList } from '@/components/features/bets/bet-list';
import { MyBets } from '@/components/features/bets/my-bets';
import { HistoryList } from '@/components/features/history/history-list';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { MobileBalanceBar } from '@/components/features/vault/mobile-balance-bar';
import { Leaderboard } from '@/components/features/leaderboard/leaderboard';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWebSocket } from '@/hooks/use-websocket';
import { usePendingBets } from '@/hooks/use-pending-bets';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from '@/lib/i18n';
import type { WsEvent } from '@coinflip/shared/types';

type Tab = 'bets' | 'mybets' | 'history' | 'leaderboard';

export default function GamePage() {
  const [activeTab, setActiveTab] = useState<Tab>('bets');
  const { address, isConnected } = useWalletContext();
  const { addToast } = useToast();
  const { t } = useTranslation();

  // Pending bets manager (bets submitted but not yet confirmed on chain)
  const { pendingBets, addPending, handleWsEvent: handlePendingWsEvent } = usePendingBets();

  // WS event handler — server handles reveal/claim automatically
  const handleWsEvent = useCallback((event: WsEvent) => {
    handlePendingWsEvent(event);

    // Toast notifications
    if (event.type === 'bet_confirmed') {
      addToast('success', t('game.betConfirmed'));
    }
    if (event.type === 'bet_create_failed') {
      const reason = (event.data as any)?.reason ?? 'Transaction failed';
      addToast('error', t('game.betCreateFailed', { reason }));
    }
    if (event.type === 'bet_accepted') {
      addToast('info', t('game.betAcceptedWinner'));
    }
    if (event.type === 'accept_failed') {
      const reason = (event.data as any)?.reason ?? 'Transaction failed';
      addToast('error', t('game.acceptFailed', { reason }));
    }
    if (event.type === 'bet_reverted') {
      addToast('info', t('game.betReverted'));
    }
    if (event.type === 'bet_revealed') {
      const winner = (event.data as any)?.winner;
      const isWinner = winner === address;
      addToast(isWinner ? 'success' : 'info', isWinner ? t('game.youWon') : t('game.gameResult'));
    }
  }, [handlePendingWsEvent, addToast, address, t]);

  const { isConnected: wsConnected } = useWebSocket({ address, enabled: isConnected, onEvent: handleWsEvent });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bets', label: t('game.openBets') },
    { id: 'mybets', label: t('game.myBets') },
    { id: 'history', label: t('game.historyTab') },
    { id: 'leaderboard', label: t('game.topPlayers') },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24 md:pb-6">
      {/* WS disconnection warning */}
      {isConnected && !wsConnected && (
        <div className="flex items-center gap-2 rounded-xl bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 px-3 py-2 text-xs text-[var(--color-warning)]">
          <span className="h-2 w-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
          {t('game.reconnecting')}
        </div>
      )}

      {/* Vault Balance — compact bar on mobile, full on desktop */}
      <MobileBalanceBar />
      <div className="hidden md:block">
        <BalanceDisplay />
      </div>

      {/* Create Bet */}
      <CreateBetForm onBetSubmitted={addPending} />

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-[var(--color-border)] mb-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'bets' && <BetList pendingBets={pendingBets} />}
        {activeTab === 'mybets' && <MyBets pendingBets={pendingBets} />}
        {activeTab === 'history' && <HistoryList />}
        {activeTab === 'leaderboard' && <Leaderboard />}
      </div>
    </div>
  );
}
