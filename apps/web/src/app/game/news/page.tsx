'use client';

import { useMemo, useState } from 'react';
import { Newspaper, Trophy, Megaphone, Sparkles, Gem, Loader2, ChevronDown, Send } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useNewsFeed, type NewsFeedItem, type NewsFeedType } from '@/hooks/use-news';
import { useWalletContext } from '@/contexts/wallet-context';
import { SponsoredForm } from '@/components/features/announcements/sponsored-form';
import { UserAvatar } from '@/components/ui';
import { formatLaunch } from '@coinflip/shared/constants';
import Link from 'next/link';

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
    <div className="mx-auto max-w-2xl px-4 py-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
            <Newspaper size={18} className="text-[var(--color-primary)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">{t('news.title')}</h1>
            <p className="text-[10px] text-[var(--color-text-secondary)] truncate">{t('news.subtitle')}</p>
          </div>
        </div>
        {isConnected && (
          <button
            type="button"
            onClick={() => setShowSponsored(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-[11px] font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
          >
            <Send size={12} />
            <span className="hidden sm:inline">{t('sponsored.button')}</span>
          </button>
        )}
      </div>

      <SponsoredForm open={showSponsored} onClose={() => setShowSponsored(false)} />

      {/* Filter Chips — icon-only on mobile, icon+text on sm+ */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTER_OPTIONS.map(({ value, labelKey, icon: Icon }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                active
                  ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
              } h-8 w-8 sm:w-auto sm:px-3`}
              title={t(labelKey)}
            >
              <Icon size={14} />
              <span className="hidden sm:inline whitespace-nowrap">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-[var(--color-surface)] animate-pulse border border-[var(--color-border)]" />
          ))}
        </div>
      ) : allItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center">
          <Newspaper size={36} className="mx-auto mb-3 text-[var(--color-text-secondary)] opacity-20" />
          <p className="text-sm text-[var(--color-text-secondary)]">{t('news.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {allItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
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

  // Big win and jackpot use a special compact layout
  if (item.type === 'big_win' || item.type === 'jackpot_win') {
    return (
      <div className={`rounded-xl border bg-[var(--color-surface)] overflow-hidden ${typeConfig.borderClass}`}>
        <div className="flex items-center gap-3 px-3.5 py-3">
          {/* Icon */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            item.type === 'big_win' ? 'bg-amber-500/15' : 'bg-purple-500/15'
          }`}>
            {item.type === 'big_win'
              ? <Trophy size={20} className="text-amber-400" />
              : <Gem size={20} className="text-purple-400" />
            }
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {item.type === 'big_win' ? (
              <BigWinContent item={item} />
            ) : (
              <JackpotWinContent item={item} />
            )}
          </div>

          {/* Time */}
          <span className="shrink-0 text-[10px] text-[var(--color-text-secondary)]">{relativeTime}</span>
        </div>
      </div>
    );
  }

  // Sponsor info for announcements
  const sponsorAddress = item.metadata.sponsorAddress as string | undefined;
  const sponsorNickname = item.metadata.sponsorNickname as string | undefined;

  // News post and announcement — full card
  return (
    <div className={`rounded-xl border bg-[var(--color-surface)] overflow-hidden ${typeConfig.borderClass}`}>
      {/* Type badge row */}
      <div className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${typeConfig.headerClass}`}>
        {typeConfig.icon}
        <span>{typeConfig.label}</span>
        {item.metadata.priority === 'important' && (
          <span className="rounded bg-amber-500/20 px-1.5 py-px text-[9px] font-bold text-amber-400 ml-1">
            {t('news.important')}
          </span>
        )}
        <span className="ml-auto font-normal normal-case text-[var(--color-text-secondary)]">{relativeTime}</span>
      </div>

      {/* Sponsor row */}
      {sponsorAddress && (
        <Link
          href={`/game/profile/${sponsorAddress}`}
          className="flex items-center gap-2 px-3.5 py-1.5 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors group"
        >
          <UserAvatar address={sponsorAddress} size={16} />
          <span className="text-[11px] font-medium text-teal-400 group-hover:text-teal-300 truncate">
            {sponsorNickname || shortAddress(sponsorAddress)}
          </span>
          <span className="text-[9px] text-[var(--color-text-secondary)] shrink-0">{t('announcement.sponsor')}</span>
        </Link>
      )}

      {/* Content */}
      <div className="px-3.5 py-2.5">
        {item.title && <h3 className="text-[13px] font-bold mb-1 leading-snug">{item.title}</h3>}
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap line-clamp-4">{item.content}</p>
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
    <div className="min-w-0">
      <p className="text-xs truncate">
        <span className="font-bold text-amber-400">{winner}</span>
        <span className="text-[var(--color-text-secondary)]"> {t('news.won')} </span>
        <span className="font-bold text-green-400">{payoutStr ? formatLaunch(payoutStr) : '?'} LAUNCH</span>
      </p>
      {amountStr && (
        <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
          {t('news.betSize')}: {formatLaunch(amountStr)} LAUNCH
        </p>
      )}
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
    <div className="min-w-0">
      <p className="text-xs truncate">
        <span className="font-bold text-purple-400">{winner}</span>
        <span className="text-[var(--color-text-secondary)]"> {t('news.wonThe')} </span>
        <span className="font-bold">{tierName ?? t('news.typeJackpot')}</span>
        {cycle != null && <span className="text-[var(--color-text-secondary)]"> #{cycle}</span>}
      </p>
      {amountStr && (
        <p className="text-[10px] text-green-400 font-bold mt-0.5">
          {formatLaunch(amountStr)} LAUNCH
        </p>
      )}
    </div>
  );
}

function getTypeConfig(type: NewsFeedType, t: (key: string) => string) {
  switch (type) {
    case 'news_post':
      return {
        icon: <Sparkles size={11} />,
        label: t('news.typeUpdate'),
        borderClass: 'border-[var(--color-border)]',
        headerClass: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
      };
    case 'announcement':
      return {
        icon: <Megaphone size={11} />,
        label: t('news.typeAnnouncement'),
        borderClass: 'border-blue-500/20',
        headerClass: 'bg-blue-500/10 text-blue-400',
      };
    case 'big_win':
      return {
        icon: <Trophy size={11} />,
        label: t('news.typeBigWin'),
        borderClass: 'border-amber-500/20',
        headerClass: 'bg-amber-500/10 text-amber-400',
      };
    case 'jackpot_win':
      return {
        icon: <Gem size={11} />,
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
