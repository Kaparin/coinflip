'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

// ─── Types ────────────────────────────────────────────

interface VipTierConfig {
  tier: string;
  price: string;
  isActive: boolean;
}

interface VipStatus {
  active: boolean;
  tier: string | null;
  expiresAt: string | null;
  boostsUsedToday: number;
  boostLimit: number | null;
}

interface PinSlot {
  slot: number;
  betId: string | null;
  userId: string | null;
  userAddress: string | null;
  userNickname: string | null;
  price: string;
  outbidPrice: string;
  pinnedAt: string | null;
}

// ─── Helper ───────────────────────────────────────────

async function vipFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...init?.headers,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw err;
  }
  return res.json() as Promise<T>;
}

// ─── Hooks ────────────────────────────────────────────

/** Get VIP tier prices (public, no auth needed) */
export function useVipConfig() {
  return useQuery({
    queryKey: ['/api/v1/vip/config'],
    queryFn: async (): Promise<VipTierConfig[]> => {
      const json = await vipFetch<{ tiers: VipTierConfig[] }>('/api/v1/vip/config');
      return json.tiers;
    },
    staleTime: 60_000,
  });
}

/** Get current user's VIP status (auth required) */
export function useVipStatus(enabled = true) {
  return useQuery({
    queryKey: ['/api/v1/vip/status'],
    queryFn: async (): Promise<VipStatus> => {
      return vipFetch<VipStatus>('/api/v1/vip/status');
    },
    staleTime: 30_000,
    enabled,
  });
}

/** Purchase VIP subscription */
export function usePurchaseVip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tier: string) => {
      return vipFetch<{ success: boolean; expiresAt: string }>('/api/v1/vip/purchase', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/v1/vip/status'] });
      qc.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    },
  });
}

/** Boost a bet */
export function useBoostBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (betId: string) => {
      return vipFetch<{ success: boolean }>('/api/v1/vip/boost', {
        method: 'POST',
        body: JSON.stringify({ betId }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/v1/bets'] });
      qc.invalidateQueries({ queryKey: ['/api/v1/vip/status'] });
    },
  });
}

/** Pin a bet to a slot */
export function usePinBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ betId, slot }: { betId: string; slot: number }) => {
      return vipFetch<{ success: boolean }>('/api/v1/vip/pin', {
        method: 'POST',
        body: JSON.stringify({ betId, slot }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/v1/bets'] });
      qc.invalidateQueries({ queryKey: ['/api/v1/vip/pins'] });
      qc.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    },
  });
}

/** Get current pin slots (public) */
export function usePinSlots() {
  return useQuery({
    queryKey: ['/api/v1/vip/pins'],
    queryFn: async (): Promise<PinSlot[]> => {
      const json = await vipFetch<{ slots: PinSlot[] }>('/api/v1/vip/pins');
      return json.slots;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ─── Diamond Customization ───────────────────────────

export interface VipCustomization {
  nameGradient: string;
  frameStyle: string;
  badgeIcon: string;
}

/** Get current Diamond VIP customization */
export function useVipCustomization(enabled = true) {
  return useQuery({
    queryKey: ['/api/v1/vip/customization'],
    queryFn: async (): Promise<VipCustomization> => {
      return vipFetch<VipCustomization>('/api/v1/vip/customization');
    },
    staleTime: 60_000,
    enabled,
  });
}

/** Update Diamond VIP customization */
export function useUpdateVipCustomization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<VipCustomization>) => {
      return vipFetch<VipCustomization>('/api/v1/vip/customization', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(['/api/v1/vip/customization'], result);
      qc.invalidateQueries({ queryKey: ['/api/v1/bets'] });
    },
  });
}
