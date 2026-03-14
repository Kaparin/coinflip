'use client';

import { useState } from 'react';
import {
  Crown, UserMinus, Copy, Check, Trash2, LogOut, UserPlus, Search, Loader2, Shield,
  ArrowRightLeft, History, Flame, Send, Mail,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useTournamentTeam,
  useDeleteTeam,
  useLeaveTeam,
  useKickMember,
  useMyJoinRequests,
  useResolveJoinRequest,
  useSearchUsers,
  useInvitePlayer,
  useTransferCaptain,
  usePointHistory,
  useMyInvites,
  useResolveInvite,
  useUpdateTeam,
} from '@/hooks/use-tournaments';
import type { Tournament } from '@/hooks/use-tournaments';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AxmIcon } from '@/components/ui/axm-icon';
import { TeamAvatarPicker } from '@/components/features/tournaments/team-avatar-picker';

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function TournamentMyTeamTab({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();

  // Show pending invites even if not in a team yet
  const { data: myInvites } = useMyInvites(tournament.id);
  const resolveInvite = useResolveInvite();

  if (!tournament.myTeamId) {
    return (
      <div className="space-y-3 animate-fade-up">
        {/* Pending invites */}
        {myInvites && myInvites.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-[var(--color-surface)] p-4">
            <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Mail size={14} className="text-amber-400" />
              Invitations ({myInvites.length})
            </h4>
            <div className="space-y-2">
              {myInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-bg)]">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text)] truncate">{inv.teamName}</p>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">
                      {inv.invitedByNickname || shortAddr(inv.invitedByAddress)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => resolveInvite.mutate({ tournamentId: tournament.id, inviteId: inv.id, accept: true })}
                      disabled={resolveInvite.isPending}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                    >
                      {t('tournament.approve')}
                    </button>
                    <button
                      onClick={() => resolveInvite.mutate({ tournamentId: tournament.id, inviteId: inv.id, accept: false })}
                      disabled={resolveInvite.isPending}
                      className="text-[10px] px-3 py-1.5 rounded-lg bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                    >
                      {t('tournament.reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
          <Shield size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {tournament.status === 'registration' ? t('tournament.noTeams') : t('tournament.myTeam')}
          </p>
        </div>
      </div>
    );
  }

  return <MyTeamContent tournament={tournament} teamId={tournament.myTeamId} />;
}

function MyTeamContent({ tournament, teamId }: { tournament: Tournament; teamId: string }) {
  const { t } = useTranslation();
  const { data: team, isLoading } = useTournamentTeam(tournament.id, teamId);
  const { data: joinRequests } = useMyJoinRequests(tournament.id);
  const { data: pointHistory } = usePointHistory(tournament.id);
  const deleteTeam = useDeleteTeam();
  const leaveTeam = useLeaveTeam();
  const kickMember = useKickMember();
  const resolveRequest = useResolveJoinRequest();
  const transferCaptain = useTransferCaptain();
  const invitePlayer = useInvitePlayer();
  const updateTeam = useUpdateTeam();

  const [codeCopied, setCodeCopied] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

  const isRegistration = tournament.status === 'registration';
  const { data: searchResults } = useSearchUsers(searchQuery);

  if (isLoading || !team) {
    return <div className="h-40 rounded-xl bg-[var(--color-surface)] animate-pulse" />;
  }

  // isCaptain comes from the server (tournament response) — reliable
  const amCaptain = tournament.isCaptain ?? false;

  const copyCode = () => {
    if (team.inviteCode) {
      navigator.clipboard.writeText(team.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleInvite = (targetUserId: string) => {
    invitePlayer.mutate({ tournamentId: tournament.id, targetUserId });
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Team header */}
      <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isRegistration && amCaptain ? (
              <TeamAvatarPicker
                currentUrl={team.avatarUrl}
                onUrlChange={(url) => updateTeam.mutate({ tournamentId: tournament.id, avatarUrl: url ?? '' })}
                size={44}
              />
            ) : team.avatarUrl ? (
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

        {/* Share link */}
        <button
          onClick={() => {
            const url = `${window.location.origin}/game/tournaments/${tournament.id}`;
            navigator.clipboard.writeText(url);
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
          }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--color-bg)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          <Send size={12} />
          Share tournament link
        </button>

        {/* Prize display */}
        {team.prizeAmount && BigInt(team.prizeAmount) > 0n && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-xs text-amber-400">{t('tournament.winner')} — #{team.finalRank} {t('tournament.place')}</p>
            <p className="text-lg font-bold text-[var(--color-warning)] flex items-center justify-center gap-1">
              {formatAXM(team.prizeAmount)} <AxmIcon size={16} />
            </p>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournament.team')}</h4>
          {isRegistration && amCaptain && (
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <UserPlus size={12} />
              {t('tournament.invitePlayer')}
            </button>
          )}
        </div>

        {/* Search & Invite */}
        {showSearch && (
          <div className="mb-3 space-y-2 p-3 rounded-xl bg-[var(--color-bg)]">
            <div className="flex gap-1">
              <Search size={14} className="text-[var(--color-text-secondary)] mt-2 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('tournament.searchPlaceholder')}
                className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--color-surface)]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserAvatar address={u.address} size={18} />
                      <span className="text-xs text-[var(--color-text)] truncate">{u.nickname || shortAddr(u.address)}</span>
                    </div>
                    <button
                      onClick={() => handleInvite(u.id)}
                      disabled={invitePlayer.isPending}
                      className="text-[10px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0"
                    >
                      {invitePlayer.isPending ? <Loader2 size={10} className="animate-spin" /> : t('tournament.invitePlayer')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {invitePlayer.isSuccess && (
              <p className="text-[10px] text-emerald-400">{t('tournament.requestSent')}</p>
            )}
          </div>
        )}

        {/* Members list */}
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
                    <span>{m.gamesWon}/{m.gamesPlayed}</span>
                    {m.bestStreak > 0 && (
                      <span className="flex items-center gap-0.5 text-orange-400">
                        <Flame size={9} /> {m.bestStreak}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions (captain only, registration only) */}
              {isRegistration && amCaptain && !m.isCaptain && (
                <div className="flex items-center gap-1 shrink-0">
                  {/* Transfer captain */}
                  {transferTarget === m.userId ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          transferCaptain.mutate({ tournamentId: tournament.id, newCaptainUserId: m.userId });
                          setTransferTarget(null);
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-600 text-white"
                      >
                        Yes
                      </button>
                      <button onClick={() => setTransferTarget(null)} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setTransferTarget(m.userId)} className="p-1 rounded hover:bg-amber-500/10" title="Transfer captain">
                      <ArrowRightLeft size={12} className="text-[var(--color-text-secondary)]" />
                    </button>
                  )}

                  {/* Kick */}
                  {kickTarget === m.userId ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { kickMember.mutate({ tournamentId: tournament.id, userId: m.userId }); setKickTarget(null); }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white"
                      >
                        Yes
                      </button>
                      <button onClick={() => setKickTarget(null)} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setKickTarget(m.userId)} className="p-1 rounded hover:bg-red-500/10" title={t('tournament.kickMember')}>
                      <UserMinus size={12} className="text-[var(--color-text-secondary)]" />
                    </button>
                  )}
                </div>
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
                    className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
                  >
                    {t('tournament.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Point history */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full text-sm font-semibold text-[var(--color-text)]"
        >
          <span className="flex items-center gap-2">
            <History size={14} className="text-indigo-400" />
            Point History
          </span>
          <span className="text-[10px] text-[var(--color-text-secondary)]">{showHistory ? '▲' : '▼'}</span>
        </button>

        {showHistory && pointHistory && (
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
            {pointHistory.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)] py-2 text-center">No points yet</p>
            ) : (
              pointHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-[var(--color-bg)] text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={entry.reason === 'win' ? 'text-emerald-400' : 'text-red-400'}>
                      {entry.reason === 'win' ? '🏆' : '🎯'}
                    </span>
                    <span className="text-[var(--color-text-secondary)]">
                      {formatAXM(entry.betAmount)} AXM
                    </span>
                  </div>
                  <span className={`font-bold ${entry.reason === 'win' ? 'text-emerald-400' : 'text-orange-400'}`}>
                    +{entry.pointsEarned}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

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
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text-secondary)]">Cancel</button>
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
                <button onClick={() => setConfirmLeave(false)} className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-surface)] text-[var(--color-text-secondary)]">Cancel</button>
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
