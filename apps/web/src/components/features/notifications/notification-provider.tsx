'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingNotifications, useMarkNotificationRead, type Notification } from '@/hooks/use-notifications';
import { JackpotWinModal } from './jackpot-win-modal';
import type { WsEvent } from '@coinflip/shared/types';

interface NotificationContextValue {
  /** Push a WS event to be processed as a potential notification */
  handleWsEvent: (event: WsEvent) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  handleWsEvent: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

interface QueuedNotification {
  id: string;
  type: string;
  tierName: string;
  amount: string;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, address } = useWalletContext();
  const { data: pendingNotifications } = usePendingNotifications(isConnected);
  const markRead = useMarkNotificationRead();

  const [queue, setQueue] = useState<QueuedNotification[]>([]);
  const [current, setCurrent] = useState<QueuedNotification | null>(null);
  const processedIds = useRef<Set<string>>(new Set());

  // Process pending notifications from API (for offline users coming back online)
  useEffect(() => {
    if (!pendingNotifications?.length) return;

    const newItems: QueuedNotification[] = [];
    for (const n of pendingNotifications) {
      if (n.type === 'jackpot_won' && !processedIds.current.has(n.id)) {
        processedIds.current.add(n.id);
        newItems.push({
          id: n.id,
          type: n.type,
          tierName: (n.metadata as Record<string, unknown>)?.tierName as string ?? 'mini',
          amount: String((n.metadata as Record<string, unknown>)?.amount ?? '0'),
        });
      }
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  }, [pendingNotifications]);

  // Handle real-time WS events
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type !== 'jackpot_won') return;

    const data = event.data as Record<string, unknown>;
    // Only show the modal if this is a personal notification (targeted to this user)
    if (!data.isPersonal) return;

    const wsId = `ws_${data.poolId}`;
    if (processedIds.current.has(wsId)) return;
    processedIds.current.add(wsId);

    setQueue((prev) => [
      ...prev,
      {
        id: wsId,
        type: 'jackpot_won',
        tierName: String(data.tierName ?? 'mini'),
        amount: String(data.amount ?? '0'),
      },
    ]);
  }, []);

  // Show next in queue
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next!);
    setQueue(rest);
  }, [current, queue]);

  const handleDismiss = useCallback(() => {
    if (current && !current.id.startsWith('ws_')) {
      // Mark DB notification as read
      markRead.mutate(current.id);
    }
    setCurrent(null);
  }, [current, markRead]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setQueue([]);
      setCurrent(null);
      processedIds.current.clear();
    }
  }, [isConnected]);

  return (
    <NotificationContext.Provider value={{ handleWsEvent }}>
      {children}
      {current?.type === 'jackpot_won' && (
        <JackpotWinModal
          open={true}
          onDismiss={handleDismiss}
          tierName={current.tierName}
          amount={current.amount}
        />
      )}
    </NotificationContext.Provider>
  );
}
