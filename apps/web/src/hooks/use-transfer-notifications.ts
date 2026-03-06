'use client';

import { useEffect } from 'react';
import { useWebSocketContext } from '@/contexts/websocket-context';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from '@/lib/i18n';
import { formatLaunch } from '@coinflip/shared/constants';
import type { WsEvent } from '@coinflip/shared/types';

/**
 * Listens for incoming transfer WS notifications and shows a toast.
 * Mount once in the game layout.
 */
export function useTransferNotifications() {
  const { subscribe } = useWebSocketContext();
  const { addToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = subscribe((event: WsEvent) => {
      if (event.type === 'coin_transfer') {
        const data = event.data as {
          fromAddress: string;
          fromNickname: string | null;
          amount: string;
          fee: string;
          currency: 'coin' | 'axm';
          message: string | null;
        };
        const sender = data.fromNickname || `${data.fromAddress.slice(0, 8)}...${data.fromAddress.slice(-4)}`;
        const formattedAmount = formatLaunch(data.amount);
        const curr = data.currency?.toUpperCase() || 'COIN';

        if (data.message) {
          addToast(
            'success',
            t('social.transferReceivedWithMsg', {
              sender,
              message: data.message,
              amount: formattedAmount,
              currency: curr,
            }),
          );
        } else {
          addToast(
            'success',
            t('social.transferReceived', {
              sender,
              amount: formattedAmount,
              currency: curr,
            }),
          );
        }
      }
    });

    return unsub;
  }, [subscribe, addToast, t]);
}
