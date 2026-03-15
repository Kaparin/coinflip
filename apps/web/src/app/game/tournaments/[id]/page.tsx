'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Info, Newspaper, Users, BarChart3, Settings, Trophy, Swords } from 'lucide-react';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { useTournament } from '@/hooks/use-tournaments';
import { TournamentProgressBar } from '@/components/features/tournaments/tournament-progress-bar';
import { TournamentInfoTab } from '@/components/features/tournaments/tabs/info-tab';
import { TournamentNewsTab } from '@/components/features/tournaments/tabs/news-tab';
import { TournamentTeamsTab } from '@/components/features/tournaments/tabs/teams-tab';
import { TournamentLeaderboardTab } from '@/components/features/tournaments/tabs/leaderboard-tab';
import { TournamentMyTeamTab } from '@/components/features/tournaments/tabs/my-team-tab';
import { TournamentPaywall } from '@/components/features/tournaments/tournament-paywall';
import { TournamentResultsTab } from '@/components/features/tournaments/tabs/results-tab';
import { AxmIcon } from '@/components/ui/axm-icon';

type Tab = 'info' | 'news' | 'teams' | 'leaderboard' | 'myteam' | 'results';

const BASE_TABS: Array<{ id: Tab; icon: typeof Info; labelKey: string }> = [
  { id: 'info', icon: Info, labelKey: 'tournament.info' },
  { id: 'news', icon: Newspaper, labelKey: 'tournament.news' },
  { id: 'teams', icon: Users, labelKey: 'tournament.teams' },
  { id: 'leaderboard', icon: BarChart3, labelKey: 'tournament.leaderboard' },
  { id: 'myteam', icon: Settings, labelKey: 'tournament.myTeam' },
];

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { data: tournament, isLoading } = useTournament(id);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  useEffect(() => {
    if (!tournament) return;
    if (['completed', 'calculating', 'archived'].includes(tournament.status)) {
      setActiveTab('results');
    } else if (tournament.status === 'active' && tournament.hasPaid) {
      setActiveTab('leaderboard');
    } else if (tournament.status === 'registration' && tournament.hasPaid) {
      setActiveTab('teams');
    }
  }, [tournament?.status, tournament?.hasPaid]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-3 sm:px-4 py-4 sm:py-6 space-y-3 pb-24 md:pb-6">
          <div className="h-6 w-32 rounded-lg bg-[var(--color-surface)] animate-pulse" />
          <div className="h-36 rounded-2xl bg-[var(--color-surface)] animate-pulse" />
          <div className="h-10 rounded-xl bg-[var(--color-surface)] animate-pulse" />
          <div className="h-48 rounded-2xl bg-[var(--color-surface)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="h-full overflow-y-auto flex items-center justify-center px-4">
        <div className="text-center">
          <Swords size={40} className="text-[var(--color-text-secondary)] mx-auto mb-3 opacity-30" />
          <p className="text-sm text-[var(--color-text-secondary)]">{t('events.notFound')}</p>
          <button onClick={() => router.push('/game/events')} className="mt-3 text-indigo-400 text-sm">
            {t('events.backToEvents')}
          </button>
        </div>
      </div>
    );
  }

  const title = pickLocalized(locale, tournament.title, tournament.titleEn, tournament.titleRu);
  const hasPaid = tournament.hasPaid;
  const isFinished = ['completed', 'calculating', 'archived'].includes(tournament.status);
  const TABS = isFinished
    ? [{ id: 'results' as Tab, icon: Trophy, labelKey: 'tournament.results' }, ...BASE_TABS]
    : BASE_TABS;

  // Show paywall only if registration is still open (by time) and user hasn't paid
  const regStillOpen = tournament.status === 'registration' && new Date(tournament.registrationEndsAt) > new Date();
  if (!hasPaid && regStillOpen) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-lg px-3 sm:px-4 py-4 sm:py-6 pb-24 md:pb-6">
          <button
            onClick={() => router.push('/game/events')}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-3 transition-colors active:opacity-70"
          >
            <ArrowLeft size={14} />
            {t('events.backToEvents')}
          </button>
          <TournamentPaywall tournament={tournament} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-3 sm:py-6 pb-24 md:pb-6">
        {/* Back */}
        <button
          onClick={() => router.push('/game/events')}
          className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-3 transition-colors active:opacity-70"
        >
          <ArrowLeft size={14} />
          {t('events.backToEvents')}
        </button>

        {/* Header card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4 space-y-2.5 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
              <Swords size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-[var(--color-text)] truncate">{title}</h1>
          </div>

          <TournamentProgressBar tournament={tournament} />

          {/* Stats — 3 cols on mobile, compact */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="text-center py-2 px-1 rounded-xl bg-[var(--color-bg)]">
              <div className="text-sm sm:text-lg font-bold text-[var(--color-warning)] flex items-center justify-center gap-0.5">
                <Trophy size={12} className="sm:w-4 sm:h-4" />
                {formatAXM(tournament.totalPrizePool)}
              </div>
              <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.prizePool')}</div>
            </div>
            <div className="text-center py-2 px-1 rounded-xl bg-[var(--color-bg)]">
              <div className="text-sm sm:text-lg font-bold text-[var(--color-text)]">{tournament.participantCount}</div>
              <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.participants')}</div>
            </div>
            <div className="text-center py-2 px-1 rounded-xl bg-[var(--color-bg)]">
              <div className="text-sm sm:text-lg font-bold text-[var(--color-text)]">{tournament.teamCount}</div>
              <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.teams')}</div>
            </div>
          </div>
        </div>

        {/* Tab bar — scrollable horizontally on mobile */}
        <div className="sticky top-0 z-10 bg-[var(--color-bg)]/95 backdrop-blur-sm -mx-3 sm:-mx-4 px-3 sm:px-4 py-1.5 mb-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
            {TABS.map(({ id: tabId, icon: Icon, labelKey }) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all active:scale-95 ${
                  activeTab === tabId
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-transparent'
                }`}
              >
                <Icon size={12} className="sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline sm:inline">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-[200px]">
          {activeTab === 'info' && <TournamentInfoTab tournament={tournament} />}
          {activeTab === 'news' && <TournamentNewsTab tournamentId={tournament.id} />}
          {activeTab === 'teams' && <TournamentTeamsTab tournament={tournament} />}
          {activeTab === 'leaderboard' && <TournamentLeaderboardTab tournament={tournament} />}
          {activeTab === 'myteam' && <TournamentMyTeamTab tournament={tournament} />}
          {activeTab === 'results' && <TournamentResultsTab tournament={tournament} />}
        </div>
      </div>
    </div>
  );
}
