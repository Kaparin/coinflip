'use client';

import { useState } from 'react';
import { BarChart3, Trophy, Flame } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useTeamLeaderboard, useIndividualLeaderboard } from '@/hooks/use-tournaments';
import type { Tournament, TeamLeaderboardEntry, IndividualLeaderboardEntry } from '@/hooks/use-tournaments';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AxmIcon } from '@/components/ui/axm-icon';

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
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
    <div className="space-y-2.5 animate-fade-up">
      {/* Toggle */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-[var(--color-bg)]">
        <button
          onClick={() => setMode('teams')}
          className={`flex-1 py-1.5 sm:py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all active:scale-95 ${
            mode === 'teams' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {t('tournament.teamLeaderboard')}
        </button>
        <button
          onClick={() => setMode('individual')}
          className={`flex-1 py-1.5 sm:py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all active:scale-95 ${
            mode === 'individual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-[var(--color-text-secondary)]'
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

function TeamLeaderboard({ tournamentId }: { tournamentId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTeamLeaderboard(tournamentId);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
        <BarChart3 size={28} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-30" />
        <p className="text-xs text-[var(--color-text-secondary)]">{t('events.noLeaderboardData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.map((entry, i) => {
        const isTop3 = entry.rank <= 3;
        const rankColor = entry.rank === 1 ? 'text-amber-400' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-orange-400' : 'text-[var(--color-text-secondary)]';

        return (
          <div
            key={entry.teamId}
            className={`flex items-center gap-2 p-2.5 sm:p-3 rounded-xl border transition-all animate-fade-up ${
              isTop3 ? 'bg-[var(--color-warning)]/5 border-[var(--color-warning)]/10' : 'bg-[var(--color-surface)] border-[var(--color-border)]'
            }`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {/* Rank */}
            <div className={`w-6 text-center text-xs sm:text-sm font-bold ${rankColor} shrink-0`}>
              {isTop3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
            </div>

            {/* Team */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {entry.teamAvatarUrl ? (
                <img src={entry.teamAvatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center text-[9px] font-bold text-indigo-400 shrink-0">
                  {entry.teamName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-[var(--color-text)] truncate">{entry.teamName}</p>
                <p className="text-[9px] text-[var(--color-text-secondary)]">{entry.memberCount} {t('tournament.participants')}</p>
              </div>
            </div>

            {/* Points */}
            <div className="text-right shrink-0">
              <p className="text-xs sm:text-sm font-bold text-[var(--color-text)]">{entry.totalPoints}</p>
              <p className="text-[8px] sm:text-[9px] text-[var(--color-text-secondary)]">{t('tournament.points')}</p>
            </div>

            {/* Prize */}
            {entry.prizeAmount && BigInt(entry.prizeAmount) > 0n && (
              <div className="hidden sm:flex items-center gap-0.5 text-[11px] font-semibold text-[var(--color-warning)] shrink-0">
                {formatAXM(entry.prizeAmount)} <AxmIcon size={11} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IndividualLeaderboard({ tournamentId, myTeamId }: { tournamentId: string; myTeamId?: string | null }) {
  const { t } = useTranslation();
  const { data, isLoading } = useIndividualLeaderboard(tournamentId);

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-11 rounded-lg bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center">
        <BarChart3 size={28} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-30" />
        <p className="text-xs text-[var(--color-text-secondary)]">{t('events.noLeaderboardData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {data.map((entry, i) => {
        const isMyTeam = entry.teamId === myTeamId;
        const rankColor = entry.rank <= 3 ? 'text-amber-400' : 'text-[var(--color-text-secondary)]';

        return (
          <div
            key={entry.userId}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all animate-fade-up ${
              isMyTeam ? 'bg-indigo-500/10 border border-indigo-500/20' : 'hover:bg-[var(--color-surface)]'
            }`}
            style={{ animationDelay: `${i * 20}ms` }}
          >
            <span className={`w-5 text-center text-[10px] sm:text-xs font-bold ${rankColor} shrink-0`}>
              {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
            </span>

            <UserAvatar address={entry.address} size={20} />

            <div className="flex-1 min-w-0">
              <span className="text-[11px] sm:text-xs text-[var(--color-text)] truncate block">
                {entry.nickname || shortAddr(entry.address)}
              </span>
            </div>

            <span className="text-[10px] text-[var(--color-text-secondary)] hidden sm:inline truncate max-w-[60px]">
              [{entry.teamName}]
            </span>

            <span className="text-[11px] sm:text-xs font-bold text-[var(--color-text)] w-8 text-right shrink-0">
              {entry.totalPoints}
            </span>

            <span className="text-[10px] text-emerald-400 w-8 text-right shrink-0 hidden xs:inline">
              {entry.gamesWon}W
            </span>

            {entry.bestStreak > 1 && (
              <span className="text-[9px] text-orange-400 shrink-0 hidden sm:flex items-center gap-0.5">
                <Flame size={9} />{entry.bestStreak}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
