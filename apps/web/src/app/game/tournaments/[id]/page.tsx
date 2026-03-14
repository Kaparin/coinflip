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
import { AxmIcon } from '@/components/ui/axm-icon';

type Tab = 'info' | 'news' | 'teams' | 'leaderboard' | 'myteam';

const TABS: Array<{ id: Tab; icon: typeof Info; labelKey: string }> = [
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

  // Auto-select relevant tab based on status
  useEffect(() => {
    if (!tournament) return;
    if (tournament.status === 'active' && tournament.hasPaid) {
      setActiveTab('leaderboard');
    } else if (tournament.status === 'registration' && tournament.hasPaid) {
      setActiveTab('teams');
    }
  }, [tournament?.status, tournament?.hasPaid]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="h-8 w-48 rounded-lg bg-[var(--color-surface)] animate-pulse" />
        <div className="h-40 rounded-2xl bg-[var(--color-surface)] animate-pulse" />
        <div className="h-64 rounded-2xl bg-[var(--color-surface)] animate-pulse" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-[var(--color-text-secondary)]">{t('events.notFound')}</p>
        <button onClick={() => router.push('/game/events')} className="mt-4 text-indigo-400 text-sm">
          {t('events.backToEvents')}
        </button>
      </div>
    );
  }

  const title = pickLocalized(locale, tournament.title, tournament.titleEn, tournament.titleRu);
  const hasPaid = tournament.hasPaid;

  // Show paywall if not paid
  if (!hasPaid && tournament.status === 'registration') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <button
          onClick={() => router.push('/game/events')}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          {t('events.backToEvents')}
        </button>
        <TournamentPaywall tournament={tournament} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Back button */}
      <button
        onClick={() => router.push('/game/events')}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft size={16} />
        {t('tournament.backToTournament')}
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-indigo-400" />
          <h1 className="text-lg font-bold text-[var(--color-text)]">{title}</h1>
        </div>

        <TournamentProgressBar tournament={tournament} />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-xl bg-[var(--color-bg)]">
            <div className="text-lg font-bold text-[var(--color-warning)] flex items-center justify-center gap-1">
              <Trophy size={16} />
              {formatAXM(tournament.totalPrizePool)}
            </div>
            <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.prizePool')}</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-[var(--color-bg)]">
            <div className="text-lg font-bold text-[var(--color-text)]">{tournament.participantCount}</div>
            <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.participants')}</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-[var(--color-bg)]">
            <div className="text-lg font-bold text-[var(--color-text)]">{tournament.teamCount}</div>
            <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{t('tournament.teams')}</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(({ id: tabId, icon: Icon, labelKey }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tabId
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-transparent'
            }`}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'info' && <TournamentInfoTab tournament={tournament} />}
        {activeTab === 'news' && <TournamentNewsTab tournamentId={tournament.id} />}
        {activeTab === 'teams' && <TournamentTeamsTab tournament={tournament} />}
        {activeTab === 'leaderboard' && <TournamentLeaderboardTab tournament={tournament} />}
        {activeTab === 'myteam' && <TournamentMyTeamTab tournament={tournament} />}
      </div>
    </div>
  );
}
