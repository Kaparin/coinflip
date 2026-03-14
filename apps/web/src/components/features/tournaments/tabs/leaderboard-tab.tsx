'use client';

import { useState } from 'react';
import { BarChart3, Trophy, Crown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useTeamLeaderboard,
  useIndividualLeaderboard,
} from '@/hooks/use-tournaments';
import type { Tournament, TeamLeaderboardEntry, IndividualLeaderboardEntry } from '@/hooks/use-tournaments';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AxmIcon } from '@/components/ui/axm-icon';

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

type Mode = 'teams' | 'individual';

export function TournamentLeaderboardTab({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('teams');

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-bg)]">
        <button
          onClick={() => setMode('teams')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            mode === 'teams' ? 'bg-indigo-600 text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('tournament.teamLeaderboard')}
        </button>
        <button
          onClick={() => setMode('individual')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            mode === 'individual' ? 'bg-indigo-600 text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('tournament.individualLeaderboard')}
        </button>
      </div>

      {mode === 'teams' ? (
        <TeamLeaderboard tournamentId={tournament.id} />
      ) : (
        <IndividualLeaderboard tournamentId={tournament.id} myTeamId={tournament.myTeamId} />
      )}
    </div>
  );
}

// ---- Team Leaderboard ----

function TeamLeaderboard({ tournamentId }: { tournamentId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTeamLeaderboard(tournamentId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
        <BarChart3 size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noLeaderboardData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((entry, i) => (
        <TeamLeaderboardRow key={entry.teamId} entry={entry} index={i} />
      ))}
    </div>
  );
}

function TeamLeaderboardRow({ entry, index }: { entry: TeamLeaderboardEntry; index: number }) {
  const { t } = useTranslation();
  const rankColor = entry.rank === 1 ? 'text-amber-400' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-orange-400' : 'text-[var(--color-text-secondary)]';
  const rankBg = entry.rank <= 3 ? 'bg-[var(--color-warning)]/5 border-[var(--color-warning)]/15' : 'bg-[var(--color-surface)] border-[var(--color-border)]';

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${rankBg} transition-all animate-fade-up`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Rank */}
      <div className={`w-7 text-center text-sm font-bold ${rankColor}`}>
        {entry.rank <= 3 ? <Trophy size={16} className="inline" /> : entry.rank}
      </div>

      {/* Team info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {entry.teamAvatarUrl ? (
          <img src={entry.teamAvatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400">
            {entry.teamName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)] truncate">{entry.teamName}</p>
          <p className="text-[10px] text-[var(--color-text-secondary)]">{entry.memberCount} {t('tournament.participants')}</p>
        </div>
      </div>

      {/* Points */}
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-[var(--color-text)]">{entry.totalPoints}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)]">{t('tournament.points')}</p>
      </div>

      {/* Prize */}
      {entry.prizeAmount && BigInt(entry.prizeAmount) > 0n && (
        <div className="flex items-center gap-1 text-xs font-semibold text-[var(--color-warning)] shrink-0">
          {formatAXM(entry.prizeAmount)} <AxmIcon size={12} />
        </div>
      )}
    </div>
  );
}

// ---- Individual Leaderboard ----

function IndividualLeaderboard({ tournamentId, myTeamId }: { tournamentId: string; myTeamId?: string | null }) {
  const { t } = useTranslation();
  const { data, isLoading } = useIndividualLeaderboard(tournamentId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
        <BarChart3 size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noLeaderboardData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider">
        <span className="w-7 text-center">#</span>
        <span className="flex-1">{t('events.player')}</span>
        <span className="w-12 text-center">{t('tournament.points')}</span>
        <span className="w-10 text-center">{t('tournament.games')}</span>
        <span className="w-10 text-center">{t('tournament.wins')}</span>
      </div>

      {data.map((entry, i) => (
        <div
          key={entry.userId}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
            entry.teamId === myTeamId ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
          } transition-all animate-fade-up`}
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <span className={`w-7 text-center text-xs font-bold ${
            entry.rank <= 3 ? 'text-amber-400' : 'text-[var(--color-text-secondary)]'
          }`}>
            {entry.rank}
          </span>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <UserAvatar address={entry.address} size={20} />
            <span className="text-xs text-[var(--color-text)] truncate">{entry.nickname || shortAddr(entry.address)}</span>
            <span className="text-[9px] text-[var(--color-text-secondary)] truncate hidden sm:inline">[{entry.teamName}]</span>
          </div>

          <span className="w-12 text-center text-xs font-bold text-[var(--color-text)]">{entry.totalPoints}</span>
          <span className="w-10 text-center text-[11px] text-[var(--color-text-secondary)]">{entry.gamesPlayed}</span>
          <span className="w-10 text-center text-[11px] text-emerald-400">{entry.gamesWon}</span>
        </div>
      ))}
    </div>
  );
}
