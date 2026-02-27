'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingNotifications, useMarkNotificationRead, type Notification } from '@/hooks/use-notifications';
import { JackpotWinModal } from './jackpot-win-modal';
import { AnnouncementModal } from './announcement-modal';
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
  // jackpot fields
  tierName?: string;
  amount?: string;
  // announcement fields
  title?: string;
  message?: string;
  priority?: 'normal' | 'important';
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
      if (processedIds.current.has(n.id)) continue;
      processedIds.current.add(n.id);

      const meta = n.metadata as Record<string, unknown> | undefined;

      if (n.type === 'jackpot_won') {
        newItems.push({
          id: n.id,
          type: n.type,
          tierName: (meta?.tierName as string) ?? 'mini',
          amount: String(meta?.amount ?? '0'),
        });
      } else if (n.type === 'announcement') {
        newItems.push({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          priority: (meta?.priority as 'normal' | 'important') ?? 'normal',
        });
      }
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  }, [pendingNotifications]);

  // Handle real-time WS events
  const handleWsEvent = useCallback((event: WsEvent) => {
    const data = event.data as Record<string, unknown>;

    if (event.type === 'jackpot_won') {
      // Only show the modal if this is a personal notification (targeted to this user)
      if (!data.isPersonal) return;

      const wsId = `ws_jackpot_${data.poolId}`;
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
    } else if (event.type === 'announcement') {
      const wsId = `ws_ann_${data.id}`;
      if (processedIds.current.has(wsId)) return;
      processedIds.current.add(wsId);

      setQueue((prev) => [
        ...prev,
        {
          id: wsId,
          type: 'announcement',
          title: String(data.title ?? ''),
          message: String(data.message ?? ''),
          priority: (data.priority as 'normal' | 'important') ?? 'normal',
        },
      ]);
    }
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
          tierName={current.tierName ?? 'mini'}
          amount={current.amount ?? '0'}
        />
      )}
      {current?.type === 'announcement' && (
        <AnnouncementModal
          open={true}
          onDismiss={handleDismiss}
          title={current.title ?? ''}
          message={current.message ?? ''}
          priority={current.priority ?? 'normal'}
        />
      )}
    </NotificationContext.Provider>
  );
}
