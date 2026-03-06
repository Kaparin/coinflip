'use client';

import { useTransferNotifications } from '@/hooks/use-transfer-notifications';

/** Drop into game layout (inside WebSocketProvider + ToastProvider). */
export function TransferNotificationListener() {
  useTransferNotifications();
  return null;
}
