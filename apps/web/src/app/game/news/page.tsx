'use client';

import { useMemo, useState } from 'react';
import { Newspaper, Trophy, Megaphone, Sparkles, Gem, Loader2, ChevronDown, Send } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useNewsFeed, type NewsFeedItem, type NewsFeedType } from '@/hooks/use-news';
import { useWalletContext } from '@/contexts/wallet-context';
import { SponsoredForm } from '@/components/features/announcements/sponsored-form';
import { formatLaunch } from '@coinflip/shared/constants';

const FILTER_OPTIONS: Array<{ value: string; labelKey: string; icon: typeof Newspaper }> = [
  { value: '', labelKey: 'news.filterAll', icon: Newspaper },
  { value: 'news_post', labelKey: 'news.filterUpdates', icon: Sparkles },
  { value: 'announcement', labelKey: 'news.filterAnnouncements', icon: Megaphone },
  { value: 'big_win', labelKey: 'news.filterBigWins', icon: Trophy },
  { value: 'jackpot_win', labelKey: 'news.filterJackpots', icon: Gem },
];

export default function NewsPage() {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const [filter, setFilter] = useState('');
  const [showSponsored, setShowSponsored] = useState(false);

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNewsFeed(filter || undefined);

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
            <Newspaper size={20} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('news.title')}</h1>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('news.subtitle')}</p>
          </div>
        </div>
        {isConnected && (
          <button
            type="button"
            onClick={() => setShowSponsored(true)}
            className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
          >
            <Send size={14} />
            {t('sponsored.button')}
          </button>
        )}
      </div>

      <SponsoredForm open={showSponsored} onClose={() => setShowSponsored(false)} />

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap border transition-colors ${
              filter === value
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : allItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-12 text-center">
          <Newspaper size={32} className="mx-auto mb-2 text-[var(--color-text-secondary)] opacity-30" />
          <p className="text-sm text-[var(--color-text-secondary)]">{t('news.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-[var(--color-border)] py-3 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30 transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <ChevronDown size={14} />
                  {t('news.loadMore')}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedCard({ item }: { item: NewsFeedItem }) {
  const { t } = useTranslation();

  const typeConfig = getTypeConfig(item.type, t);
  const relativeTime = formatRelativeTime(item.timestamp, t);

  return (
    <div className={`rounded-xl border bg-[var(--color-surface)] overflow-hidden ${typeConfig.borderClass}`}>
      {/* Type header */}
      <div className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider ${typeConfig.headerClass}`}>
        {typeConfig.icon}
        <span>{typeConfig.label}</span>
        <span className="ml-auto font-normal normal-case text-[var(--color-text-secondary)]">{relativeTime}</span>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-1">
        <h3 className="text-sm font-bold">{item.title}</h3>

        {item.type === 'big_win' ? (
          <BigWinContent item={item} />
        ) : item.type === 'jackpot_win' ? (
          <JackpotWinContent item={item} />
        ) : (
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{item.content}</p>
        )}

        {/* Priority badge for news_post/announcement */}
        {(item.type === 'news_post' || item.type === 'announcement') && item.metadata.priority === 'important' && (
          <span className="inline-block mt-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
            {t('news.important')}
          </span>
        )}
      </div>
    </div>
  );
}

function BigWinContent({ item }: { item: NewsFeedItem }) {
  const { t } = useTranslation();
  const meta = item.metadata;
  const payoutStr = meta.payoutAmount as string | undefined;
  const amountStr = meta.amount as string | undefined;
  const winner = (meta.winnerNickname as string) || shortAddress(meta.winnerAddress as string);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
        <Trophy size={20} className="text-amber-400" />
      </div>
      <div>
        <p className="text-xs">
          <span className="font-bold text-amber-400">{winner}</span>
          <span className="text-[var(--color-text-secondary)]"> {t('news.won')} </span>
          <span className="font-bold text-green-400">{payoutStr ? formatLaunch(payoutStr) : '?'} LAUNCH</span>
        </p>
        {amountStr && (
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {t('news.betSize')}: {formatLaunch(amountStr)} LAUNCH
          </p>
        )}
      </div>
    </div>
  );
}

function JackpotWinContent({ item }: { item: NewsFeedItem }) {
  const { t } = useTranslation();
  const meta = item.metadata;
  const amountStr = meta.amount as string | undefined;
  const tierName = meta.tierName as string | undefined;
  const winner = (meta.winnerNickname as string) || shortAddress(meta.winnerAddress as string);
  const cycle = meta.cycle as number | undefined;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/15">
        <Gem size={20} className="text-purple-400" />
      </div>
      <div>
        <p className="text-xs">
          <span className="font-bold text-purple-400">{winner}</span>
          <span className="text-[var(--color-text-secondary)]"> {t('news.wonThe')} </span>
          <span className="font-bold">{tierName ?? t('news.typeJackpot')}</span>
          {cycle && <span className="text-[var(--color-text-secondary)]"> #{cycle}</span>}
        </p>
        {amountStr && (
          <p className="text-[10px] text-green-400 font-bold">
            {formatLaunch(amountStr)} LAUNCH
          </p>
        )}
      </div>
    </div>
  );
}

function getTypeConfig(type: NewsFeedType, t: (key: string) => string) {
  switch (type) {
    case 'news_post':
      return {
        icon: <Sparkles size={12} />,
        label: t('news.typeUpdate'),
        borderClass: 'border-[var(--color-border)]',
        headerClass: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
      };
    case 'announcement':
      return {
        icon: <Megaphone size={12} />,
        label: t('news.typeAnnouncement'),
        borderClass: 'border-[var(--color-border)]',
        headerClass: 'bg-blue-500/10 text-blue-400',
      };
    case 'big_win':
      return {
        icon: <Trophy size={12} />,
        label: t('news.typeBigWin'),
        borderClass: 'border-amber-500/20',
        headerClass: 'bg-amber-500/10 text-amber-400',
      };
    case 'jackpot_win':
      return {
        icon: <Gem size={12} />,
        label: t('news.typeJackpot'),
        borderClass: 'border-purple-500/20',
        headerClass: 'bg-purple-500/10 text-purple-400',
      };
  }
}

function shortAddress(addr: string | undefined | null): string {
  if (!addr || addr.length < 20) return addr ?? '???';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function formatRelativeTime(iso: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('news.justNow');
  if (mins < 60) return `${mins}${t('news.mAgo')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${t('news.hAgo')}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}${t('news.dAgo')}`;
  return new Date(iso).toLocaleDateString();
}
