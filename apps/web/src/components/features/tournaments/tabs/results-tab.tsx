'use client';

import { Trophy, Crown, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useTournamentResults } from '@/hooks/use-tournaments';
import { AxmIcon } from '@/components/ui/axm-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import type { Tournament } from '@/hooks/use-tournaments';

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

interface TeamRanking {
  rank: number;
  teamId: string;
  teamName: string;
  totalPoints: string;
  prizeAmount: string;
  members: Array<{
    userId: string;
    address: string;
    nickname: string | null;
    totalPoints: string;
    gamesPlayed: number;
    gamesWon: number;
    recommendedShare: string;
  }>;
}

interface Results {
  teamRankings: TeamRanking[];
}

export function TournamentResultsTab({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const { data: rawResults, isLoading } = useTournamentResults(tournament.id);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  const results = rawResults as Results | null;

  if (!results || !results.teamRankings?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center animate-fade-up">
        <Trophy size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('tournament.noResults')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Winner banner */}
      {results.teamRankings[0] && (
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-600/20 via-yellow-500/10 to-orange-600/20 border border-amber-500/30 p-5 text-center">
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5" />
          <Trophy size={36} className="text-amber-400 mx-auto mb-2 relative" />
          <h3 className="text-lg font-bold text-amber-400 relative">{t('tournament.winner')}</h3>
          <p className="text-xl font-black text-[var(--color-text)] mt-1 relative">{results.teamRankings[0].teamName}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2 text-lg font-bold text-[var(--color-warning)] relative">
            {formatAXM(results.teamRankings[0].prizeAmount)} <AxmIcon size={18} />
          </div>
        </div>
      )}

      {/* All team rankings */}
      {results.teamRankings.map((team, i) => (
        <TeamResultCard key={team.teamId} team={team} index={i} isMyTeam={team.teamId === tournament.myTeamId} />
      ))}

      {/* Note about prize distribution */}
      <div className="rounded-xl bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-secondary)] text-center">
        {t('tournament.prizeSentToCaptain')}
      </div>
    </div>
  );
}

function TeamResultCard({ team, index, isMyTeam }: { team: TeamRanking; index: number; isMyTeam: boolean }) {
  const { t } = useTranslation();
  const hasPrize = BigInt(team.prizeAmount) > 0n;

  const rankColors: Record<number, string> = {
    1: 'from-amber-500/15 to-yellow-500/5 border-amber-500/30',
    2: 'from-gray-400/15 to-gray-500/5 border-gray-400/30',
    3: 'from-orange-500/15 to-orange-400/5 border-orange-500/30',
  };

  const bgClass = rankColors[team.rank] ?? 'from-[var(--color-surface)] to-[var(--color-surface)] border-[var(--color-border)]';

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${bgClass} ${isMyTeam ? 'ring-1 ring-indigo-500/40' : ''} overflow-hidden animate-fade-up`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Team header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black ${
            team.rank === 1 ? 'bg-amber-500/20 text-amber-400'
            : team.rank === 2 ? 'bg-gray-400/20 text-gray-300'
            : team.rank === 3 ? 'bg-orange-500/20 text-orange-400'
            : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
          }`}>
            #{team.rank}
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-1.5">
              {team.teamName}
              {isMyTeam && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">{t('tournament.myTeam')}</span>}
            </h4>
            <p className="text-xs text-[var(--color-text-secondary)]">{team.totalPoints} {t('tournament.points')} • {team.members.length} {t('tournament.participants')}</p>
          </div>
        </div>

        {hasPrize && (
          <div className="text-right">
            <div className="text-base font-bold text-[var(--color-warning)] flex items-center gap-1">
              {formatAXM(team.prizeAmount)} <AxmIcon size={14} />
            </div>
            <p className="text-[9px] text-[var(--color-text-secondary)]">{t('tournament.prizePool')}</p>
          </div>
        )}
      </div>

      {/* Members with recommended shares */}
      <div className="border-t border-[var(--color-border)]/50">
        <div className="grid grid-cols-[1fr_60px_50px_80px] gap-1 px-4 py-1.5 text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)]">
          <span>{t('events.player')}</span>
          <span className="text-center">{t('tournament.points')}</span>
          <span className="text-center">{t('tournament.wins')}</span>
          <span className="text-right">{t('tournament.recommendedShare')}</span>
        </div>

        {team.members.map((m, mi) => (
          <div key={m.userId} className={`grid grid-cols-[1fr_60px_50px_80px] gap-1 px-4 py-2 items-center ${
            mi % 2 === 0 ? 'bg-white/[0.02]' : ''
          }`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <UserAvatar address={m.address} size={18} />
              <span className="text-xs text-[var(--color-text)] truncate">
                {m.nickname || shortAddr(m.address)}
              </span>
              {mi === 0 && <Crown size={10} className="text-amber-400 shrink-0" />}
            </div>
            <span className="text-xs text-center font-medium text-[var(--color-text)]">{m.totalPoints}</span>
            <span className="text-xs text-center text-emerald-400">{m.gamesWon}/{m.gamesPlayed}</span>
            <span className="text-xs text-right font-semibold text-[var(--color-warning)] flex items-center justify-end gap-0.5">
              {hasPrize ? (
                <>{formatAXM(m.recommendedShare)} <AxmIcon size={10} /></>
              ) : (
                <span className="text-[var(--color-text-secondary)]">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
