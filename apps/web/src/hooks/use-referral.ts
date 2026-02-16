'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/lib/constants';

const REF_STORAGE_KEY = 'coinflip_ref_code';

interface ReferralStats {
  directInvites: number;
  teamSize: number;
  earningsByLevel: Array<{ level: number; totalEarned: string; betCount: number }>;
  balance: { unclaimed: string; totalEarned: string };
}

interface RewardEntry {
  id: string;
  fromPlayer: string;
  betId: string;
  amount: string;
  level: number;
  createdAt: string;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...opts,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Save a referral code from URL to localStorage (before wallet connect).
 */
export function captureRefCode(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('ref');
  if (code) {
    localStorage.setItem(REF_STORAGE_KEY, code);
    // Clean URL
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }
}

/**
 * Get the captured referral code (if any).
 */
export function getCapturedRefCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REF_STORAGE_KEY);
}

/**
 * Register the captured referral code for the current user.
 * Called once after wallet connects.
 */
export async function registerCapturedRef(): Promise<boolean> {
  const code = getCapturedRefCode();
  if (!code) return false;

  const res = await fetch(`${API_URL}/api/v1/referral/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (res.ok) {
    localStorage.removeItem(REF_STORAGE_KEY);
    return true;
  }
  return false;
}

export function useReferral(isConnected: boolean) {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [rewards, setRewards] = useState<RewardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const fetchCode = useCallback(async () => {
    const data = await apiFetch<{ code: string }>('/api/v1/referral/code');
    if (data) setCode(data.code);
  }, []);

  const fetchStats = useCallback(async () => {
    const data = await apiFetch<ReferralStats>('/api/v1/referral/stats');
    if (data) setStats(data);
  }, []);

  const fetchRewards = useCallback(async () => {
    const data = await apiFetch<RewardEntry[]>('/api/v1/referral/rewards?limit=20');
    if (data) setRewards(data);
  }, []);

  const refresh = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    await Promise.all([fetchCode(), fetchStats(), fetchRewards()]);
    setLoading(false);
  }, [isConnected, fetchCode, fetchStats, fetchRewards]);

  const claim = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/referral/claim`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchStats();
      }
    } finally {
      setClaiming(false);
    }
  }, [fetchStats]);

  useEffect(() => {
    if (isConnected) refresh();
  }, [isConnected, refresh]);

  const shareUrl = typeof window !== 'undefined' && code
    ? `${window.location.origin}/?ref=${code}`
    : null;

  return { code, stats, rewards, loading, claiming, claim, refresh, shareUrl };
}
