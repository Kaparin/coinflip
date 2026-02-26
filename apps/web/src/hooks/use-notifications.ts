'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function usePendingNotifications(enabled = false) {
  return useQuery({
    queryKey: ['/api/v1/notifications/pending'],
    queryFn: async (): Promise<Notification[]> => {
      const res = await fetch(`${API_URL}/api/v1/notifications/pending`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await fetch(`${API_URL}/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/notifications/pending'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await fetch(`${API_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/notifications/pending'] });
    },
  });
}
