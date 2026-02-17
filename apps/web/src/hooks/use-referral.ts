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

function getWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('coinflip_connected_address');
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const walletAddress = getWalletAddress();
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...opts,
      headers: {
        ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
        ...opts?.headers,
      },
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

  const walletAddress = getWalletAddress();
  const res = await fetch(`${API_URL}/api/v1/referral/register`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
    },
    body: JSON.stringify({ code }),
  });

  if (res.ok) {
    localStorage.removeItem(REF_STORAGE_KEY);
    return true;
  }
  return false;
}

/**
 * Register referral by wallet address (instead of code).
 * Used in "Who invited you?" field during registration.
 */
export async function registerByAddress(address: string): Promise<{ ok: boolean; reason?: string }> {
  const walletAddress = getWalletAddress();
  try {
    const res = await fetch(`${API_URL}/api/v1/referral/register-by-address`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
      },
      body: JSON.stringify({ address }),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => null);
    return { ok: false, reason: json?.error?.code ?? 'UNKNOWN' };
  } catch {
    return { ok: false, reason: 'NETWORK_ERROR' };
  }
}

/**
 * Check if current user already has a referrer.
 */
export async function checkHasReferrer(): Promise<{
  has_referrer: boolean;
  referrer: { address: string; nickname: string | null } | null;
}> {
  const data = await apiFetch<{
    has_referrer: boolean;
    referrer: { address: string; nickname: string | null } | null;
  }>('/api/v1/referral/has-referrer');
  return data ?? { has_referrer: false, referrer: null };
}

/**
 * Public check: does a wallet address already have a referrer?
 * Used before auth — the connect modal calls this after deriving the address
 * to decide whether to show the "Who invited you?" field.
 * No auth required on the server side.
 */
export async function checkHasReferrerByAddress(address: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/referral/check-referrer?address=${encodeURIComponent(address)}`,
    );
    if (!res.ok) return false;
    const json = await res.json();
    return json?.data?.has_referrer === true;
  } catch {
    return false;
  }
}

/**
 * Change referral branch (paid: 1000 LAUNCH).
 */
export async function changeBranch(address: string): Promise<{ ok: boolean; reason?: string }> {
  const walletAddress = getWalletAddress();
  try {
    const res = await fetch(`${API_URL}/api/v1/referral/change-branch`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
      },
      body: JSON.stringify({ address }),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => null);
    return { ok: false, reason: json?.error?.code ?? 'UNKNOWN' };
  } catch {
    return { ok: false, reason: 'NETWORK_ERROR' };
  }
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
      const walletAddress = getWalletAddress();
      const res = await fetch(`${API_URL}/api/v1/referral/claim`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
        },
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
