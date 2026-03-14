'use client';

import { useState } from 'react';
import {
  Crown, UserMinus, Copy, Check, Trash2, LogOut, UserPlus, Search, Loader2, Shield,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useTournamentTeam,
  useDeleteTeam,
  useLeaveTeam,
  useKickMember,
  useMyJoinRequests,
  useResolveJoinRequest,
  useUpdateTeam,
  useSearchUsers,
} from '@/hooks/use-tournaments';
import type { Tournament } from '@/hooks/use-tournaments';
import { UserAvatar } from '@/components/ui/user-avatar';

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

export function TournamentMyTeamTab({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();

  if (!tournament.myTeamId) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center animate-fade-up">
        <Shield size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {tournament.status === 'registration'
            ? t('tournament.noTeams')
            : t('tournament.myTeam')}
        </p>
      </div>
    );
  }

  return <MyTeamContent tournament={tournament} teamId={tournament.myTeamId} />;
}

function MyTeamContent({ tournament, teamId }: { tournament: Tournament; teamId: string }) {
  const { t } = useTranslation();
  const { data: team, isLoading } = useTournamentTeam(tournament.id, teamId);
  const { data: joinRequests } = useMyJoinRequests(tournament.id);
  const deleteTeam = useDeleteTeam();
  const leaveTeam = useLeaveTeam();
  const kickMember = useKickMember();
  const resolveRequest = useResolveJoinRequest();

  const [codeCopied, setCodeCopied] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);

  const isRegistration = tournament.status === 'registration';

  if (isLoading || !team) {
    return <div className="h-40 rounded-xl bg-[var(--color-surface)] animate-pulse" />;
  }

  const isCaptain = team.captainUserId === tournament.myTeamId; // Will compare with userId from context
  // We'll determine captainship from members list
  const meAsMember = team.members?.find((m) => m.isCaptain);
  const amCaptain = !!team.members?.some((m) => m.isCaptain && m.userId === team.captainUserId);

  const copyCode = () => {
    if (team.inviteCode) {
      navigator.clipboard.writeText(team.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Team header */}
      <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {team.avatarUrl ? (
              <img src={team.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg font-bold text-indigo-400">
                {team.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">{team.name}</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">{team.memberCount} / {tournament.teamConfig.maxSize}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-lg font-bold text-indigo-400">{team.totalPoints}</p>
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('tournament.points')}</p>
          </div>
        </div>

        {/* Invite code */}
        {team.inviteCode && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-bg)]">
            <span className="text-[10px] text-[var(--color-text-secondary)]">{t('tournament.inviteCode')}:</span>
            <code className="text-xs font-mono text-[var(--color-text)] flex-1">{team.inviteCode}</code>
            <button onClick={copyCode} className="p-1 rounded hover:bg-[var(--color-surface)] transition-colors">
              {codeCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-[var(--color-text-secondary)]" />}
            </button>
          </div>
        )}

        {/* Prize if completed */}
        {team.prizeAmount && BigInt(team.prizeAmount) > 0n && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-xs text-amber-400">{t('tournament.winner')} — #{team.finalRank} {t('tournament.place')}</p>
            <p className="text-lg font-bold text-[var(--color-warning)]">
              {(Number(team.prizeAmount) / 1_000_000).toLocaleString()} AXM
            </p>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('tournament.team')}</h4>
        <div className="space-y-2">
          {team.members?.map((m) => (
            <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)]">
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar address={m.address} size={24} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-[var(--color-text)] truncate">
                      {m.nickname || shortAddr(m.address)}
                    </span>
                    {m.isCaptain && <Crown size={11} className="text-amber-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                    <span>{m.totalPoints} {t('tournament.points')}</span>
                    <span>{m.gamesWon}/{m.gamesPlayed} {t('tournament.wins')}</span>
                    {m.bestStreak > 0 && <span>🔥 {m.bestStreak}</span>}
                  </div>
                </div>
              </div>

              {/* Kick button (captain only, during registration) */}
              {isRegistration && !m.isCaptain && amCaptain && (
                kickTarget === m.userId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        kickMember.mutate({ tournamentId: tournament.id, userId: m.userId });
                        setKickTarget(null);
                      }}
                      disabled={kickMember.isPending}
                      className="text-[10px] px-2 py-1 rounded bg-red-600 text-white"
                    >
                      {kickMember.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                    </button>
                    <button
                      onClick={() => setKickTarget(null)}
                      className="text-[10px] px-2 py-1 rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setKickTarget(m.userId)}
                    className="p-1 rounded hover:bg-red-500/10 transition-colors"
                    title={t('tournament.kickMember')}
                  >
                    <UserMinus size={14} className="text-[var(--color-text-secondary)] hover:text-red-400" />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Join requests (captain only) */}
      {amCaptain && joinRequests && joinRequests.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-[var(--color-surface)] p-4">
          <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <UserPlus size={14} className="text-amber-400" />
            {t('tournament.joinRequests')} ({joinRequests.length})
          </h4>
          <div className="space-y-2">
            {joinRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)]">
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar address={req.address} size={22} />
                  <span className="text-xs text-[var(--color-text)] truncate">{req.nickname || shortAddr(req.address)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => resolveRequest.mutate({ tournamentId: tournament.id, requestId: req.id, approve: true })}
                    disabled={resolveRequest.isPending}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  >
                    {t('tournament.approve')}
                  </button>
                  <button
                    onClick={() => resolveRequest.mutate({ tournamentId: tournament.id, requestId: req.id, approve: false })}
                    disabled={resolveRequest.isPending}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
                  >
                    {t('tournament.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions (registration only) */}
      {isRegistration && (
        <div className="space-y-2">
          {amCaptain ? (
            confirmDelete ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { deleteTeam.mutate(tournament.id); setConfirmDelete(false); }}
                  disabled={deleteTeam.isPending}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  {deleteTeam.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('tournament.deleteTeamConfirm')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
                {t('tournament.deleteTeam')}
              </button>
            )
          ) : (
            confirmLeave ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { leaveTeam.mutate(tournament.id); setConfirmLeave(false); }}
                  disabled={leaveTeam.isPending}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  {leaveTeam.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('tournament.leaveConfirm')}
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border border-amber-500/20 text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <LogOut size={14} />
                {t('tournament.leaveTeam')}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
