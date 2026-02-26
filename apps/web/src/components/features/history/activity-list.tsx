'use client';

import { useState, useMemo } from 'react';
import { useActivity, type ActivityItem, type ActivityType } from '@/hooks/use-activity';
import { useWalletContext } from '@/contexts/wallet-context';
import { Skeleton } from '@/components/ui/skeleton';
import { LaunchTokenIcon } from '@/components/ui';
import { formatLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';
import { Trophy, Skull, Users, History, Gift } from 'lucide-react';
import { GiOpenTreasureChest } from 'react-icons/gi';
import Link from 'next/link';

type ActivityTab = 'all' | 'games' | 'rewards';

function truncAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

function formatRelativeTime(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('history.justNow');
  if (diffMins < 60) return t('history.minsAgo', { mins: diffMins });
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return t('history.hoursAgo', { hours: diffHrs });
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return t('history.daysAgo', { days: diffDays });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TYPE_CONFIG: Record<ActivityType, {
  icon: typeof Trophy;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  sign: '+' | '-';
}> = {
  bet_win: {
    icon: Trophy,
    colorClass: 'text-[var(--color-success)]',
    bgClass: 'bg-[var(--color-success)]/15',
    borderClass: 'border-[var(--color-success)]/20',
    sign: '+',
  },
  bet_loss: {
    icon: Skull,
    colorClass: 'text-[var(--color-danger)]',
    bgClass: 'bg-[var(--color-danger)]/15',
    borderClass: 'border-[var(--color-danger)]/20',
    sign: '-',
  },
  referral_reward: {
    icon: Gift,
    colorClass: 'text-violet-400',
    bgClass: 'bg-violet-400/15',
    borderClass: 'border-violet-400/20',
    sign: '+',
  },
  jackpot_win: {
    icon: Trophy, // placeholder — we use GiOpenTreasureChest instead
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-400/15',
    borderClass: 'border-rose-400/20',
    sign: '+',
  },
};

function ActivityRow({ item, t }: { item: ActivityItem; t: (key: string, params?: Record<string, string | number>) => string }) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.bet_win;
  const meta = item.metadata;
  const amountNum = Number(item.amount);
  const formatted = formatLaunch(Math.abs(amountNum));

  let description: string;
  switch (item.type) {
    case 'bet_win': {
      const opponent = (meta.opponentNickname as string) || truncAddr((meta.opponentAddress as string) ?? '');
      description = t('activity.betWin', { opponent });
      break;
    }
    case 'bet_loss': {
      const opponent = (meta.opponentNickname as string) || truncAddr((meta.opponentAddress as string) ?? '');
      description = t('activity.betLoss', { opponent });
      break;
    }
    case 'referral_reward': {
      const from = (meta.fromPlayerNickname as string) || truncAddr((meta.fromPlayerAddress as string) ?? '');
      const level = meta.level as number;
      description = t('activity.referralReward', { from, level });
      break;
    }
    case 'jackpot_win': {
      const tierName = meta.tierName as string;
      const displayName = t(`jackpot.tiers.${tierName}`) || tierName;
      description = t('activity.jackpotWin', { tier: displayName });
      break;
    }
    default:
      description = item.type;
  }

  const opponentAddress = (meta.opponentAddress as string) ?? null;

  return (
    <div className={`rounded-xl border ${config.borderClass} bg-[var(--color-surface)] transition-all`}>
      <div className="flex items-center gap-3 p-3">
        {/* Icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bgClass}`}>
          {item.type === 'jackpot_win' ? (
            <GiOpenTreasureChest size={18} className={config.colorClass} />
          ) : (
            <config.icon size={16} className={config.colorClass} />
          )}
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{description}</p>
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {formatRelativeTime(item.timestamp, t)}
            {opponentAddress && (
              <>
                {' · '}
                <Link
                  href={`/game/profile/${opponentAddress}`}
                  className="hover:text-[var(--color-primary)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {truncAddr(opponentAddress)}
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${config.colorClass}`}>
            {config.sign}{formatted}
          </span>
          <LaunchTokenIcon size={40} />
        </div>
      </div>
    </div>
  );
}

export function ActivityList() {
  const [tab, setTab] = useState<ActivityTab>('all');
  const { isConnected } = useWalletContext();
  const { t } = useTranslation();

  const typeFilter = tab === 'games'
    ? 'bet_win,bet_loss'
    : tab === 'rewards'
    ? 'referral_reward,jackpot_win'
    : undefined;

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useActivity({ enabled: isConnected, types: typeFilter });

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('history.connectToView')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  const TABS: { id: ActivityTab; label: string; icon: typeof Trophy }[] = [
    { id: 'all', label: t('activity.tabAll'), icon: History },
    { id: 'games', label: t('activity.tabGames'), icon: Trophy },
    { id: 'rewards', label: t('activity.tabRewards'), icon: Gift },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] ${
              tab === tabItem.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            <tabItem.icon size={12} />
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {allItems.length > 0 ? (
        <div className="space-y-2">
          {allItems.map((item) => (
            <ActivityRow key={item.id} item={item} t={t} />
          ))}

          {/* Load more */}
          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full rounded-xl border border-[var(--color-border)] py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              {isFetchingNextPage ? t('common.loading') : t('activity.loadMore')}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mx-auto mb-3">
            <History size={32} strokeWidth={1.5} />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('activity.noActivity')}
          </p>
        </div>
      )}
    </div>
  );
}
