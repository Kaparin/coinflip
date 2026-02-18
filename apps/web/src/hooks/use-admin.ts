'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { useWalletContext } from '@/contexts/wallet-context';

/** Helper: fetch with admin auth header */
async function adminFetch<T>(path: string, address: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'x-wallet-address': address,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

/** Helper: fetch that returns the full response (with pagination) */
async function adminFetchFull<T>(path: string, address: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'x-wallet-address': address,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────

interface TreasuryBalance {
  vault: { available: string; locked: string };
  wallet: { balance: string };
}

interface TreasuryStats {
  totalCommissions: string;
  totalEntries: number;
  last24h: string;
  last7d: string;
}

interface LedgerEntry {
  id: string;
  txhash: string;
  amount: string;
  denom: string;
  source: string;
  createdAt: string;
}

interface LedgerResponse {
  data: LedgerEntry[];
  pagination: Pagination;
}

interface PlatformStats {
  totalBets: number;
  totalVolume: string;
  resolvedBets: number;
  activeBets: number;
  canceledBets: number;
  totalUsers: number;
}

interface WithdrawResult {
  status: string;
  txHash: string;
  amount: string;
  message: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AdminUser {
  id: string;
  address: string;
  nickname: string | null;
  createdAt: string | null;
  vault: { available: string; locked: string };
  totalBets: number;
}

export interface AdminBet {
  betId: string;
  maker: string;
  acceptor: string | null;
  winner: string | null;
  amount: string;
  status: string;
  makerSide: string | null;
  hasSecret: boolean;
  acceptorGuess: string | null;
  createdTime: string | null;
  acceptedTime: string | null;
  resolvedTime: string | null;
  txhashCreate: string;
  commitment: string;
}

export interface StuckBet {
  betId: string;
  makerUserId: string;
  acceptorUserId: string | null;
  amount: string;
  status: string;
  createdTime: string | null;
  txhashCreate: string;
  hasSecret: boolean;
  age: string | null;
}

export interface OrphanedBet {
  chainBetId: number;
  maker: string;
  amount: string;
  commitment: string;
  secretAvailable: boolean;
}

export interface OrphanedData {
  chainTotal: number;
  dbTotal: number;
  orphanedCount: number;
  orphaned: OrphanedBet[];
}

export interface MissingSecretBet {
  betId: string;
  amount: string;
  status: string;
  createdTime: string | null;
  acceptedTime: string | null;
  txhashCreate: string;
  secretRecoverable: boolean;
}

export interface PendingSecret {
  commitment: string;
  makerSide: string;
  txHash: string | null;
  createdAt: string | null;
  age: string | null;
}

export interface DiagnosticsData {
  bets: {
    total: number;
    open: number;
    accepted: number;
    accepting: number;
    canceling: number;
    creating: number;
    revealed: number;
    canceled: number;
    timeout: number;
    missingSecrets: number;
  };
  vault: {
    totalUsers: number;
    totalAvailable: string;
    totalLocked: string;
    negativeAvailable: number;
    negativeLocked: number;
    usersWithLocked: number;
  };
  pendingSecrets: { count: number; oldest: string | null };
  stuckLockedFunds: Array<{ userId: string; address: string; locked: string }>;
  coinFlipStats: { heads: number; tails: number; total: number };
  timestamp: string;
}

export interface UserDetail {
  user: { id: string; address: string; nickname: string | null; createdAt: string | null };
  vault: { available: string; locked: string };
  chainVault: { available: string; locked: string } | null;
  chainUserBets: Array<{ id: number; status: string; amount: string; maker: string; acceptor: string | null }>;
  bets: Array<{
    betId: string;
    amount: string;
    status: string;
    makerSide: string | null;
    makerSecret: string;
    acceptorGuess: string | null;
    createdTime: string | null;
    acceptedTime: string | null;
    resolvedTime: string | null;
    winnerUserId: string | null;
    txhashCreate: string;
  }>;
}

// ─── Treasury Hooks (existing) ────────────────────────────────────

export function useAdminTreasuryBalance() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'treasury', 'balance', address],
    queryFn: () => adminFetch<TreasuryBalance>('/api/v1/admin/treasury/balance', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminTreasuryStats() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'treasury', 'stats', address],
    queryFn: () => adminFetch<TreasuryStats>('/api/v1/admin/treasury/stats', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminTreasuryLedger(page = 0, limit = 20) {
  const { address, isConnected } = useWalletContext();
  const offset = page * limit;
  return useQuery({
    queryKey: ['admin', 'treasury', 'ledger', address, offset, limit],
    queryFn: () =>
      adminFetchFull<LedgerResponse>(
        `/api/v1/admin/treasury/ledger?limit=${limit}&offset=${offset}`,
        address!,
      ),
    enabled: isConnected && !!address,
    staleTime: 10_000,
  });
}

export function useAdminPlatformStats() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'platform', 'stats', address],
    queryFn: () => adminFetch<PlatformStats>('/api/v1/admin/platform/stats', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminWithdraw() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: string) =>
      adminFetch<WithdrawResult>('/api/v1/admin/treasury/withdraw', address!, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'treasury'] });
    },
  });
}

// ─── Users Hooks ──────────────────────────────────────────────────

export function useAdminUsers(page = 0, limit = 50, search = '') {
  const { address, isConnected } = useWalletContext();
  const offset = page * limit;
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) qs.set('search', search);

  return useQuery({
    queryKey: ['admin', 'users', address, offset, limit, search],
    queryFn: () =>
      adminFetchFull<{ data: AdminUser[]; pagination: Pagination }>(
        `/api/v1/admin/users?${qs}`,
        address!,
      ),
    enabled: isConnected && !!address,
    staleTime: 10_000,
  });
}

export function useAdminUserDetail(userId: string | null) {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'user', userId, address],
    queryFn: () => adminFetch<UserDetail>(`/api/v1/admin/users/${userId}`, address!),
    enabled: isConnected && !!address && !!userId,
    staleTime: 5_000,
  });
}

// ─── Bets Hooks ───────────────────────────────────────────────────

export function useAdminBets(page = 0, limit = 50, status = '', search = '') {
  const { address, isConnected } = useWalletContext();
  const offset = page * limit;
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) qs.set('status', status);
  if (search) qs.set('search', search);

  return useQuery({
    queryKey: ['admin', 'bets', address, offset, limit, status, search],
    queryFn: () =>
      adminFetchFull<{ data: AdminBet[]; pagination: Pagination }>(
        `/api/v1/admin/bets?${qs}`,
        address!,
      ),
    enabled: isConnected && !!address,
    staleTime: 5_000,
  });
}

export function useAdminStuckBets() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'bets', 'stuck', address],
    queryFn: () => adminFetch<StuckBet[]>('/api/v1/admin/bets/stuck', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminMissingSecrets() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'bets', 'missing-secrets', address],
    queryFn: () => adminFetch<MissingSecretBet[]>('/api/v1/admin/bets/missing-secrets', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ─── Orphaned Bets ────────────────────────────────────────────────

export function useAdminOrphanedBets() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'bets', 'orphaned', address],
    queryFn: () => adminFetch<OrphanedData>('/api/v1/admin/bets/orphaned', address!),
    enabled: isConnected && !!address,
    staleTime: 15_000,
  });
}

export function useAdminImportOrphaned() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chainBetId: number) =>
      adminFetch<{ betId: number; status: string; secretRecovered: boolean; message: string }>(
        '/api/v1/admin/bets/orphaned/import',
        address!,
        { method: 'POST', body: JSON.stringify({ chainBetId }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'bets'] });
    },
  });
}

// ─── Pending Secrets ──────────────────────────────────────────────

export function useAdminPendingSecrets() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'pending-secrets', address],
    queryFn: () => adminFetch<PendingSecret[]>('/api/v1/admin/pending-secrets', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
  });
}

// ─── Diagnostics ──────────────────────────────────────────────────

export function useAdminDiagnostics() {
  const { address, isConnected } = useWalletContext();
  return useQuery({
    queryKey: ['admin', 'diagnostics', address],
    queryFn: () => adminFetch<DiagnosticsData>('/api/v1/admin/diagnostics', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ─── Admin Actions ────────────────────────────────────────────────

export function useAdminUnlockFunds() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { userId: string; amount: string }) =>
      adminFetch<{ status: string; message: string }>(
        '/api/v1/admin/actions/unlock-funds',
        address!,
        { method: 'POST', body: JSON.stringify(params) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminForceCancel() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (betId: number) =>
      adminFetch<{ betId: number; previousStatus: string; newStatus: string; message: string }>(
        '/api/v1/admin/actions/force-cancel',
        address!,
        { method: 'POST', body: JSON.stringify({ betId }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminRecoverSecret() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (betId: number) =>
      adminFetch<{ status: string; betId: number; message: string }>(
        '/api/v1/admin/actions/recover-secret',
        address!,
        { method: 'POST', body: JSON.stringify({ betId }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
