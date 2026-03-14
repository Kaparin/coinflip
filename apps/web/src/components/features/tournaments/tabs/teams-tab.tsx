'use client';

import { useState } from 'react';
import { Users, Plus, Lock, Unlock, Crown, UserPlus, Copy, Check, Loader2 } from 'lucide-react';
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
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

interface Props {
  tournament: Tournament;
}

export function TournamentTeamsTab({ tournament: t }: Props) {
  const { t: tr } = useTranslation();
  const { data: teams, isLoading } = useTournamentTeams(t.id);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const isRegistration = t.status === 'registration';
  const hasPaid = t.hasPaid;
  const hasTeam = !!t.myTeamId;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Action buttons */}
      {isRegistration && hasPaid && !hasTeam && (
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCreateForm(true); setShowJoinByCode(false); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={14} />
            {tr('tournament.createTeam')}
          </button>
          <button
            onClick={() => { setShowJoinByCode(true); setShowCreateForm(false); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <UserPlus size={14} />
            {tr('tournament.joinByCode')}
          </button>
        </div>
      )}

      {/* Create team form */}
      {showCreateForm && <CreateTeamForm tournamentId={t.id} onClose={() => setShowCreateForm(false)} />}

      {/* Join by code form */}
      {showJoinByCode && <JoinByCodeForm tournamentId={t.id} onClose={() => setShowJoinByCode(false)} />}

      {/* Teams list */}
      {!teams?.length ? (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
          <Users size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">{tr('tournament.noTeams')}</p>
        </div>
      ) : (
        teams.map((team, i) => (
          <TeamCard
            key={team!.id}
            team={team!}
            tournament={t}
            index={i}
            isMyTeam={team!.id === t.myTeamId}
          />
        ))
      )}
    </div>
  );
}

// ---- Team Card ----

function TeamCard({ team, tournament, index, isMyTeam }: { team: TournamentTeam; tournament: Tournament; index: number; isMyTeam: boolean }) {
  const { t } = useTranslation();
  const joinTeam = useJoinTeam();
  const sendRequest = useSendJoinRequest();
  const isRegistration = tournament.status === 'registration';
  const canJoin = isRegistration && tournament.hasPaid && !tournament.myTeamId;
  const isFull = team.memberCount >= (tournament.teamConfig.maxSize ?? 10);

  const handleJoin = () => {
    if (team.isOpen) {
      joinTeam.mutate({ tournamentId: tournament.id, teamId: team.id });
    } else {
      sendRequest.mutate({ tournamentId: tournament.id, teamId: team.id });
    }
  };

  return (
    <div
      className={`rounded-xl border ${isMyTeam ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'} p-3 animate-fade-up transition-all`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {team.avatarUrl ? (
            <img src={team.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Users size={14} className="text-indigo-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold text-[var(--color-text)] truncate">{team.name}</h4>
              {team.isOpen ? <Unlock size={12} className="text-emerald-400 shrink-0" /> : <Lock size={12} className="text-amber-400 shrink-0" />}
              {isMyTeam && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 shrink-0">{t('tournament.myTeam')}</span>}
            </div>
            <p className="text-[10px] text-[var(--color-text-secondary)]">
              {team.memberCount}/{tournament.teamConfig.maxSize} • {team.totalPoints} {t('tournament.points')}
            </p>
          </div>
        </div>

        {/* Join / Request button */}
        {canJoin && !isFull && (
          <button
            onClick={handleJoin}
            disabled={joinTeam.isPending || sendRequest.isPending}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 shrink-0"
          >
            {joinTeam.isPending || sendRequest.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : team.isOpen ? (
              t('tournament.joinTeam')
            ) : (
              t('tournament.sendRequest')
            )}
          </button>
        )}
        {isFull && canJoin && (
          <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">{t('tournament.teamFull')}</span>
        )}
      </div>

      {/* Members */}
      {team.members && team.members.length > 0 && (
        <div className="space-y-1 mt-2 pt-2 border-t border-[var(--color-border)]">
          {team.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <UserAvatar address={m.address} size={18} />
                <span className="text-[var(--color-text)] truncate">{m.nickname || shortAddr(m.address)}</span>
                {m.isCaptain && <Crown size={10} className="text-amber-400 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 text-[var(--color-text-secondary)] shrink-0">
                <span>{m.totalPoints} {t('tournament.points')}</span>
                <span>{m.gamesPlayed} {t('tournament.games')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Create Team Form ----

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
      await createTeam.mutateAsync({
        tournamentId,
        name: name.trim(),
        description: description.trim() || undefined,
        avatarUrl: avatarUrl ?? undefined,
        isOpen,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-4 space-y-3 animate-fade-up">
      <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournament.createTeam')}</h4>

      {/* Avatar picker */}
      <div className="flex items-center gap-3">
        <TeamAvatarPicker currentUrl={avatarUrl} onUrlChange={setAvatarUrl} size={56} />
        <div className="flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tournament.teamName')}
            maxLength={50}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('tournament.teamDescription')}
        maxLength={500}
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50 resize-none"
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
          className="rounded border-[var(--color-border)] bg-[var(--color-bg)] text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-xs text-[var(--color-text)]">{t(isOpen ? 'tournament.openTeam' : 'tournament.closedTeam')}</span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || createTeam.isPending}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
        >
          {createTeam.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('tournament.createTeam')}
        </button>
      </div>
    </div>
  );
}

// ---- Join by Code Form ----

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
      setError(err instanceof Error ? err.message : 'Invalid code');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-[var(--color-surface)] p-4 space-y-3 animate-fade-up">
      <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournament.joinByCode')}</h4>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('tournament.enterInviteCode')}
        className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] font-mono placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-indigo-500/50"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!code.trim() || joinByCode.isPending}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
        >
          {joinByCode.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('tournament.joinTeam')}
        </button>
      </div>
    </div>
  );
}
