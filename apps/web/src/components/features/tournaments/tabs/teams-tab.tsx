'use client';

import { useState } from 'react';
import { Users, Plus, Lock, Unlock, Crown, UserPlus, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useTournamentTeams,
  useCreateTeam,
  useJoinTeam,
  useJoinByCode,
  useSendJoinRequest,
} from '@/hooks/use-tournaments';
import type { Tournament, TournamentTeam } from '@/hooks/use-tournaments';
import { UserAvatar } from '@/components/ui/user-avatar';
import { TeamAvatarPicker } from '@/components/features/tournaments/team-avatar-picker';

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

export function TournamentTeamsTab({ tournament: t }: { tournament: Tournament }) {
  const { t: tr } = useTranslation();
  const { data: teams, isLoading } = useTournamentTeams(t.id);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const isRegistration = t.status === 'registration';
  const hasPaid = t.hasPaid;
  const hasTeam = !!t.myTeamId;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[var(--color-surface)] animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-up">
      {/* Actions */}
      {isRegistration && hasPaid && !hasTeam && (
        <div className="flex gap-1.5">
          <button
            onClick={() => { setShowCreateForm(true); setShowJoinByCode(false); }}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors active:scale-95"
          >
            <Plus size={13} />
            {tr('tournament.createTeam')}
          </button>
          <button
            onClick={() => { setShowJoinByCode(true); setShowCreateForm(false); }}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] transition-colors active:scale-95"
          >
            <UserPlus size={13} />
            {tr('tournament.joinByCode')}
          </button>
        </div>
      )}

      {showCreateForm && <CreateTeamForm tournamentId={t.id} onClose={() => setShowCreateForm(false)} />}
      {showJoinByCode && <JoinByCodeForm tournamentId={t.id} onClose={() => setShowJoinByCode(false)} />}

      {!teams?.length ? (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center">
          <Users size={28} className="text-[var(--color-text-secondary)] mx-auto mb-1.5 opacity-30" />
          <p className="text-xs text-[var(--color-text-secondary)]">{tr('tournament.noTeams')}</p>
        </div>
      ) : (
        teams.map((team, i) => team && (
          <TeamCard key={team.id} team={team} tournament={t} index={i} isMyTeam={team.id === t.myTeamId} />
        ))
      )}
    </div>
  );
}

function TeamCard({ team, tournament, index, isMyTeam }: { team: TournamentTeam; tournament: Tournament; index: number; isMyTeam: boolean }) {
  const { t } = useTranslation();
  const joinTeam = useJoinTeam();
  const sendRequest = useSendJoinRequest();
  const [requestSent, setRequestSent] = useState(false);
  const isRegistration = tournament.status === 'registration';
  const canJoin = isRegistration && tournament.hasPaid && !tournament.myTeamId;
  const isFull = team.memberCount >= (tournament.teamConfig.maxSize ?? 10);

  const handleJoin = async () => {
    if (team.isOpen) {
      joinTeam.mutate({ tournamentId: tournament.id, teamId: team.id });
    } else {
      await sendRequest.mutateAsync({ tournamentId: tournament.id, teamId: team.id });
      setRequestSent(true);
    }
  };

  const isLoading = joinTeam.isPending || sendRequest.isPending;

  return (
    <div
      className={`rounded-xl border p-2.5 sm:p-3 animate-fade-up transition-all ${
        isMyTeam ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {team.avatarUrl ? (
            <img src={team.avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
              <Users size={12} className="text-indigo-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h4 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] truncate">{team.name}</h4>
              {team.isOpen ? <Unlock size={10} className="text-emerald-400 shrink-0" /> : <Lock size={10} className="text-amber-400 shrink-0" />}
              {isMyTeam && <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-400 shrink-0">{t('tournament.myTeam')}</span>}
            </div>
            <p className="text-[9px] text-[var(--color-text-secondary)]">
              {team.memberCount}/{tournament.teamConfig.maxSize} • {team.totalPoints} {t('tournament.points')}
            </p>
          </div>
        </div>

        {canJoin && !isFull && !requestSent && (
          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 shrink-0 active:scale-95"
          >
            {isLoading ? <Loader2 size={11} className="animate-spin" /> : team.isOpen ? t('tournament.joinTeam') : t('tournament.sendRequest')}
          </button>
        )}
        {requestSent && (
          <span className="text-[9px] text-emerald-400 shrink-0">{t('tournament.requestSent')}</span>
        )}
        {isFull && canJoin && (
          <span className="text-[9px] text-[var(--color-text-secondary)] shrink-0">{t('tournament.teamFull')}</span>
        )}
      </div>

      {/* Members (compact) */}
      {team.members && team.members.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-[var(--color-border)]/50">
          {team.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-1 text-[9px] sm:text-[10px] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md">
              <UserAvatar address={m.address} size={14} />
              <span className="text-[var(--color-text)] truncate max-w-[60px] sm:max-w-[80px]">{m.nickname || shortAddr(m.address)}</span>
              {m.isCaptain && <Crown size={8} className="text-amber-400 shrink-0" />}
              <span className="text-[var(--color-text-secondary)]">{m.totalPoints}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTeamForm({ tournamentId, onClose }: { tournamentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const createTeam = useCreateTeam();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createTeam.mutateAsync({ tournamentId, name: name.trim(), description: description.trim() || undefined, avatarUrl: avatarUrl ?? undefined, isOpen });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-3 space-y-2.5 animate-fade-up">
      <h4 className="text-xs font-semibold text-[var(--color-text)]">{t('tournament.createTeam')}</h4>

      <div className="flex items-center gap-2.5">
        <TeamAvatarPicker currentUrl={avatarUrl} onUrlChange={setAvatarUrl} size={48} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('tournament.teamName')}
          maxLength={50}
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('tournament.teamDescription')}
        maxLength={500}
        rows={2}
        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50 resize-none"
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)}
          className="rounded border-[var(--color-border)] bg-[var(--color-bg)] text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
        <span className="text-[10px] text-[var(--color-text)]">{t(isOpen ? 'tournament.openTeam' : 'tournament.closedTeam')}</span>
      </label>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex gap-1.5">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-[11px] font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)] active:scale-95">
          {t('events.winModal.dismiss')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || createTeam.isPending}
          className="flex-1 py-2 rounded-lg text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 active:scale-95"
        >
          {createTeam.isPending ? <Loader2 size={13} className="animate-spin mx-auto" /> : t('tournament.createTeam')}
        </button>
      </div>
    </div>
  );
}

function JoinByCodeForm({ tournamentId, onClose }: { tournamentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const joinByCode = useJoinByCode();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setError(null);
    try {
      await joinByCode.mutateAsync({ tournamentId, inviteCode: code.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-3 space-y-2.5 animate-fade-up">
      <h4 className="text-xs font-semibold text-[var(--color-text)]">{t('tournament.joinByCode')}</h4>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('tournament.enterInviteCode')}
        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50"
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-1.5">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-[11px] font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)] active:scale-95">
          {t('events.winModal.dismiss')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!code.trim() || joinByCode.isPending}
          className="flex-1 py-2 rounded-lg text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 active:scale-95"
        >
          {joinByCode.isPending ? <Loader2 size={13} className="animate-spin mx-auto" /> : t('tournament.joinTeam')}
        </button>
      </div>
    </div>
  );
}
