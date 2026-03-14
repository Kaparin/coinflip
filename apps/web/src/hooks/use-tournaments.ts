'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

// ---- Helpers ----

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

// ---- Types ----

export type TournamentStatus = 'draft' | 'registration' | 'active' | 'calculating' | 'completed' | 'canceled' | 'archived';

export interface Tournament {
  id: string;
  title: string;
  description: string | null;
  titleEn: string | null;
  titleRu: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  status: TournamentStatus;
  entryFee: string;
  prizePool: string;
  bonusPool: string;
  totalPrizePool: string;
  commissionBps: number;
  prizeDistribution: Array<{ place: number; percent: number }>;
  scoringConfig: { tiers: Array<{ minAmount: string; maxAmount: string; winPoints: number; lossPoints: number }> };
  teamConfig: { minSize: number; maxSize: number };
  maxParticipants: number | null;
  participantCount: number;
  teamCount: number;
  registrationStartsAt: string;
  registrationEndsAt: string;
  startsAt: string;
  endsAt: string;
  hasPaid?: boolean;
  myTeamId?: string | null;
  isCaptain?: boolean;
  createdAt: string;
}

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  captainUserId: string;
  captainAddress: string;
  captainNickname: string | null;
  inviteCode: string | null;
  isOpen: boolean;
  totalPoints: string;
  memberCount: number;
  maxSize?: number;
  finalRank: number | null;
  prizeAmount: string | null;
  members?: TeamMember[];
}

export interface TeamMember {
  userId: string;
  address: string;
  nickname: string | null;
  avatarUrl: string | null;
  totalPoints: string;
  gamesPlayed: number;
  gamesWon: number;
  bestStreak: number;
  isCaptain: boolean;
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  teamAvatarUrl: string | null;
  totalPoints: string;
  memberCount: number;
  prizeAmount: string | null;
}

export interface IndividualLeaderboardEntry {
  rank: number;
  userId: string;
  address: string;
  nickname: string | null;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  totalPoints: string;
  gamesPlayed: number;
  gamesWon: number;
  bestStreak: number;
}

export interface JoinRequest {
  id: string;
  teamId: string;
  userId: string;
  address: string;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
}

export interface TournamentNotification {
  id: string;
  tournamentId: string;
  type: string;
  title: string;
  titleEn: string | null;
  titleRu: string | null;
  message: string | null;
  messageEn: string | null;
  messageRu: string | null;
  createdAt: string;
}

// ---- Query keys ----

export const tournamentKeys = {
  all: ['tournaments'] as const,
  active: () => [...tournamentKeys.all, 'active'] as const,
  completed: () => [...tournamentKeys.all, 'completed'] as const,
  detail: (id: string) => [...tournamentKeys.all, id] as const,
  teams: (id: string) => [...tournamentKeys.all, id, 'teams'] as const,
  team: (id: string, teamId: string) => [...tournamentKeys.all, id, 'teams', teamId] as const,
  teamLeaderboard: (id: string) => [...tournamentKeys.all, id, 'leaderboard', 'teams'] as const,
  individualLeaderboard: (id: string) => [...tournamentKeys.all, id, 'leaderboard', 'individual'] as const,
  myRequests: (id: string) => [...tournamentKeys.all, id, 'my-requests'] as const,
  notifications: (id: string) => [...tournamentKeys.all, id, 'notifications'] as const,
  results: (id: string) => [...tournamentKeys.all, id, 'results'] as const,
};

// ---- Queries ----

export function useActiveTournaments() {
  return useQuery({
    queryKey: tournamentKeys.active(),
    queryFn: () => apiFetch<Tournament[]>('/api/v1/tournaments/active'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCompletedTournaments(limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...tournamentKeys.completed(), limit, offset],
    queryFn: () => apiFetch<Tournament[]>(`/api/v1/tournaments/completed?limit=${limit}&offset=${offset}`),
    staleTime: 60_000,
  });
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => apiFetch<Tournament>(`/api/v1/tournaments/${id}`),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!id,
  });
}

export function useTournamentTeams(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.teams(tournamentId),
    queryFn: () => apiFetch<TournamentTeam[]>(`/api/v1/tournaments/${tournamentId}/teams`),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!tournamentId,
  });
}

export function useTournamentTeam(tournamentId: string, teamId: string) {
  return useQuery({
    queryKey: tournamentKeys.team(tournamentId, teamId),
    queryFn: () => apiFetch<TournamentTeam>(`/api/v1/tournaments/${tournamentId}/teams/${teamId}`),
    staleTime: 15_000,
    enabled: !!tournamentId && !!teamId,
  });
}

export function useTeamLeaderboard(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.teamLeaderboard(tournamentId),
    queryFn: () => apiFetch<TeamLeaderboardEntry[]>(`/api/v1/tournaments/${tournamentId}/leaderboard/teams`),
    staleTime: 15_000,
    refetchInterval: 20_000,
    enabled: !!tournamentId,
  });
}

export function useIndividualLeaderboard(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.individualLeaderboard(tournamentId),
    queryFn: () => apiFetch<IndividualLeaderboardEntry[]>(`/api/v1/tournaments/${tournamentId}/leaderboard/individual`),
    staleTime: 15_000,
    refetchInterval: 20_000,
    enabled: !!tournamentId,
  });
}

export function useMyJoinRequests(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.myRequests(tournamentId),
    queryFn: () => apiFetch<JoinRequest[]>(`/api/v1/tournaments/${tournamentId}/my-requests`),
    staleTime: 10_000,
    enabled: !!tournamentId,
  });
}

export function useTournamentNotifications(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.notifications(tournamentId),
    queryFn: () => apiFetch<TournamentNotification[]>(`/api/v1/tournaments/${tournamentId}/notifications`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!tournamentId,
  });
}

export function useTournamentResults(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.results(tournamentId),
    queryFn: () => apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/results`),
    staleTime: 60_000,
    enabled: !!tournamentId,
  });
}

// ---- Mutations ----

export function usePayEntryFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) =>
      apiFetch<{ paid: boolean }>(`/api/v1/tournaments/${tournamentId}/pay`, { method: 'POST' }),
    onSuccess: (_, tournamentId) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, ...body }: { tournamentId: string; name: string; description?: string; avatarUrl?: string; isOpen?: boolean }) =>
      apiFetch<TournamentTeam>(`/api/v1/tournaments/${tournamentId}/teams`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, ...body }: { tournamentId: string; name?: string; description?: string; avatarUrl?: string; isOpen?: boolean }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/teams/my`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/teams/my`, { method: 'DELETE' }),
    onSuccess: (_, tournamentId) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useJoinTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, teamId }: { tournamentId: string; teamId: string }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/teams/${teamId}/join`, { method: 'POST' }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useJoinByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, inviteCode }: { tournamentId: string; inviteCode: string }) =>
      apiFetch<{ joined: boolean; teamId: string }>(`/api/v1/tournaments/${tournamentId}/join-by-code`, {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useLeaveTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/leave`, { method: 'POST' }),
    onSuccess: (_, tournamentId) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useKickMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, userId }: { tournamentId: string; userId: string }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/kick`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
    },
  });
}

export function useSendJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, teamId }: { tournamentId: string; teamId: string }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/teams/${teamId}/request`, { method: 'POST' }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
    },
  });
}

export function useResolveJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, requestId, approve }: { tournamentId: string; requestId: string; approve: boolean }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/requests/${requestId}`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.myRequests(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
    },
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['tournament-search-users', query],
    queryFn: () => apiFetch<Array<{ id: string; address: string; nickname: string | null; avatarUrl: string | null }>>(
      `/api/v1/tournaments/search/users?q=${encodeURIComponent(query)}`,
    ),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}

// ---- Point history ----

export interface PointLogEntry {
  id: string;
  betId: string;
  pointsEarned: number;
  reason: string;
  betAmount: string;
  createdAt: string;
}

export function usePointHistory(tournamentId: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(tournamentId), 'points'],
    queryFn: () => apiFetch<PointLogEntry[]>(`/api/v1/tournaments/${tournamentId}/my-points`),
    staleTime: 15_000,
    enabled: !!tournamentId,
  });
}

// ---- Captain transfer ----

export function useTransferCaptain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, newCaptainUserId }: { tournamentId: string; newCaptainUserId: string }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/transfer-captain`, {
        method: 'POST',
        body: JSON.stringify({ newCaptainUserId }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
    },
  });
}

// ---- Invite system ----

export interface TournamentInvite {
  id: string;
  tournamentId: string;
  teamId: string;
  teamName: string;
  teamAvatarUrl: string | null;
  invitedByAddress: string;
  invitedByNickname: string | null;
  status: string;
  createdAt: string;
}

export function useInvitePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, targetUserId }: { tournamentId: string; targetUserId: string }) =>
      apiFetch<{ invited: boolean }>(`/api/v1/tournaments/${tournamentId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
    },
  });
}

export function useMyInvites(tournamentId: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(tournamentId), 'invites'],
    queryFn: () => apiFetch<TournamentInvite[]>(`/api/v1/tournaments/${tournamentId}/my-invites`),
    staleTime: 10_000,
    enabled: !!tournamentId,
  });
}

export function useResolveInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, inviteId, accept }: { tournamentId: string; inviteId: string; accept: boolean }) =>
      apiFetch<unknown>(`/api/v1/tournaments/${tournamentId}/invites/${inviteId}`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),
    onSuccess: (_, { tournamentId }) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(tournamentId) });
      qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}
