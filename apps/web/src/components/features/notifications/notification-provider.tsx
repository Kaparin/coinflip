'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingNotifications, useMarkNotificationRead, type Notification } from '@/hooks/use-notifications';
import { JackpotWinModal } from './jackpot-win-modal';
import { AnnouncementModal } from './announcement-modal';
import { EventStartModal } from './event-start-modal';
import type { WsEvent } from '@coinflip/shared/types';
import { feedback } from '@/lib/feedback';

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
  priority?: 'normal' | 'important' | 'sponsored';
  sponsorAddress?: string;
  sponsorNickname?: string;
  // event_started fields
  eventId?: string;
  eventType?: string;
  description?: string | null;
  totalPrizePool?: string;
  endsAt?: string;
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
          priority: (meta?.priority as 'normal' | 'important' | 'sponsored') ?? 'normal',
          sponsorAddress: (meta?.sponsorAddress as string) ?? undefined,
          sponsorNickname: (meta?.sponsorNickname as string) ?? undefined,
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
          priority: (data.priority as 'normal' | 'important' | 'sponsored') ?? 'normal',
          sponsorAddress: data.sponsorAddress ? String(data.sponsorAddress) : undefined,
          sponsorNickname: data.sponsorNickname ? String(data.sponsorNickname) : undefined,
        },
      ]);
    } else if (event.type === 'event_started') {
      const wsId = `ws_event_${data.eventId}`;
      if (processedIds.current.has(wsId)) return;
      processedIds.current.add(wsId);

      setQueue((prev) => [
        ...prev,
        {
          id: wsId,
          type: 'event_started',
          eventId: String(data.eventId ?? ''),
          eventType: String(data.type ?? 'raffle'),
          title: String(data.title ?? ''),
          description: data.description ? String(data.description) : null,
          totalPrizePool: String(data.totalPrizePool ?? '0'),
          endsAt: String(data.endsAt ?? ''),
          sponsorAddress: data.sponsorAddress ? String(data.sponsorAddress) : undefined,
          sponsorNickname: data.sponsorNickname ? String(data.sponsorNickname) : undefined,
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
    // Play feedback when showing a notification
    if (next!.type === 'jackpot_won') {
      feedback('jackpot');
    } else {
      feedback('notification');
    }
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
          sponsorAddress={current.sponsorAddress}
          sponsorNickname={current.sponsorNickname}
        />
      )}
      {current?.type === 'event_started' && (
        <EventStartModal
          open={true}
          onDismiss={handleDismiss}
          eventId={current.eventId ?? ''}
          eventType={current.eventType ?? 'raffle'}
          title={current.title ?? ''}
          description={current.description}
          totalPrizePool={current.totalPrizePool ?? '0'}
          endsAt={current.endsAt ?? ''}
          sponsorAddress={current.sponsorAddress}
          sponsorNickname={current.sponsorNickname}
        />
      )}
    </NotificationContext.Provider>
  );
}
