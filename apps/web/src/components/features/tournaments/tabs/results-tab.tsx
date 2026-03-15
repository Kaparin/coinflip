'use client';

import { Trophy, Crown } from 'lucide-react';
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
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
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

export function TournamentResultsTab({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const { data: rawResults, isLoading } = useTournamentResults(tournament.id);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-[var(--color-surface)] animate-pulse" />)}
      </div>
    );
  }

  const results = rawResults as { teamRankings: TeamRanking[] } | null;

  if (!results?.teamRankings?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center animate-fade-up">
        <Trophy size={28} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-30" />
        <p className="text-xs text-[var(--color-text-secondary)]">{t('tournament.noResults')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Winner banner */}
      {results.teamRankings[0] && (
        <div className="rounded-xl bg-gradient-to-br from-amber-600/20 via-yellow-500/10 to-orange-600/15 border border-amber-500/25 p-4 sm:p-5 text-center">
          <div className="text-2xl mb-1">🏆</div>
          <p className="text-xs text-amber-400 font-medium">{t('tournament.winner')}</p>
          <p className="text-base sm:text-lg font-black text-[var(--color-text)] mt-0.5">{results.teamRankings[0].teamName}</p>
          <div className="flex items-center justify-center gap-1 mt-1 text-sm sm:text-base font-bold text-[var(--color-warning)]">
            {formatAXM(results.teamRankings[0].prizeAmount)} <AxmIcon size={14} />
          </div>
        </div>
      )}

      {/* Team results */}
      {results.teamRankings.map((team, i) => {
        const hasPrize = BigInt(team.prizeAmount) > 0n;
        const isMyTeam = team.teamId === tournament.myTeamId;
        const medals = ['🥇', '🥈', '🥉'];

        return (
          <div
            key={team.teamId}
            className={`rounded-xl border overflow-hidden animate-fade-up ${
              isMyTeam ? 'border-indigo-500/30 ring-1 ring-indigo-500/20' : 'border-[var(--color-border)]'
            } bg-[var(--color-surface)]`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Team header */}
            <div className="p-3 sm:p-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg sm:text-xl shrink-0">{medals[team.rank - 1] ?? `#${team.rank}`}</span>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)] truncate flex items-center gap-1">
                    {team.teamName}
                    {isMyTeam && <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-400">{t('tournament.myTeam')}</span>}
                  </h4>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{team.totalPoints} {t('tournament.points')}</p>
                </div>
              </div>

              {hasPrize && (
                <div className="text-right shrink-0">
                  <div className="text-xs sm:text-sm font-bold text-[var(--color-warning)] flex items-center gap-0.5">
                    {formatAXM(team.prizeAmount)} <AxmIcon size={12} />
                  </div>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="border-t border-[var(--color-border)]/50">
              {team.members.map((m, mi) => (
                <div key={m.userId} className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 ${mi % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                  <UserAvatar address={m.address} size={18} />
                  <span className="text-[10px] sm:text-xs text-[var(--color-text)] truncate flex-1 min-w-0">
                    {m.nickname || shortAddr(m.address)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-[var(--color-text-secondary)] shrink-0">{m.totalPoints}pt</span>
                  <span className="text-[9px] sm:text-[10px] text-emerald-400 shrink-0">{m.gamesWon}W</span>
                  {hasPrize && (
                    <span className="text-[9px] sm:text-[10px] font-medium text-[var(--color-warning)] shrink-0 flex items-center gap-0.5">
                      {formatAXM(m.recommendedShare)} <AxmIcon size={8} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[9px] text-center text-[var(--color-text-secondary)] pb-2">{t('tournament.prizeSentToCaptain')}</p>
    </div>
  );
}
