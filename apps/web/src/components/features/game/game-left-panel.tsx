'use client';

import { useState, useEffect, useCallback } from 'react';
import { Crown, ChevronRight, TrendingUp, Trophy, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useGetVaultBalance } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { useTopWinner } from '@/hooks/use-top-winner';
import { useJackpotActive } from '@/hooks/use-jackpot';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { formatLaunch, fromMicroLaunch } from '@coinflip/shared/constants';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';
import { GameTokenIcon, UserAvatar } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { fetchStakingStats, formatNumber, type StakingStats } from '@/lib/staking';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

// ─── Compact Balance Widget ──────────────────────────────

function BalanceWidget() {
  const { t } = useTranslation();
  const { isConnected, address } = useWalletContext();
  const { data, isLoading } = useGetVaultBalance({
    query: {
      enabled: isConnected,
      refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    },
  });
  const { data: walletBalanceRaw } = useWalletBalance(address);

  if (!isConnected) return null;

  if (isLoading) return <Skeleton className="h-16 rounded-xl" />;

  const balance = data?.data;
  const available = fromMicroLaunch(BigInt(balance?.available ?? '0'));
  const locked = fromMicroLaunch(BigInt(balance?.locked ?? '0'));
  const wallet = fromMicroLaunch(walletBalanceRaw ?? '0');
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <Link href="/game/wallet" className="block">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 hover:border-[var(--color-primary)]/30 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('balance.vault')}
          </span>
          <GameTokenIcon size={14} />
        </div>
        <div className="text-xl font-bold tabular-nums text-[var(--color-success)] leading-tight">
          {fmt(available)}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {locked > 0 && (
            <span className="text-[10px] text-[var(--color-warning)]">
              {t('balance.inBetsShort')} {fmt(locked)}
            </span>
          )}
          {wallet > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-secondary)]">
              <Wallet size={9} /> {fmt(wallet)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Compact Jackpot Widget ──────────────────────────────

function JackpotWidget() {
  const { t } = useTranslation();
  const { data: pools, isLoading } = useJackpotActive();

  if (isLoading || !pools || pools.length === 0) return null;

  const totalAmount = pools.reduce((sum, p) => sum + BigInt(p.currentAmount), 0n);
  const totalFormatted = formatLaunch(totalAmount.toString());
  const closest = pools.reduce((best, pool) => pool.progress > best.progress ? pool : best);

  return (
    <Link href="/game/jackpot" className="group block">
      <div className="rounded-xl border border-rose-500/20 bg-[var(--color-surface)] p-3 hover:border-rose-500/40 transition-colors">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">
            {t('jackpot.bannerTitle')}
          </span>
          <ChevronRight size={12} className="text-[var(--color-text-secondary)] group-hover:text-rose-400 transition-colors" />
        </div>
        <div className="text-lg font-black tabular-nums text-rose-400 leading-tight">
          {totalFormatted}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <GameTokenIcon size={10} />
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            {pools.length} {t('jackpot.bannerPools', { count: pools.length })}
          </span>
          <span className="text-[9px] text-rose-400/80 font-medium ml-auto">
            {t(`jackpot.tiers.${closest.tierName}`)} {closest.progress}%
          </span>
        </div>
        {/* Mini progress */}
        <div className="mt-2 h-1 rounded-full bg-rose-500/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-violet-400 transition-all duration-700"
            style={{ width: `${Math.min(100, closest.progress)}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Compact Top Winner Widget ───────────────────────────

function TopWinnerWidget() {
  const { t } = useTranslation();
  const { data: winner, isLoading } = useTopWinner();

  if (isLoading || !winner) return null;

  const displayName = winner.nickname || shortAddr(winner.address);
  const payout = formatLaunch(winner.payout);

  return (
    <Link href={`/game/profile/${winner.address}`} className="group block">
      <div className="rounded-xl border border-amber-500/20 bg-[var(--color-surface)] p-3 hover:border-amber-500/40 transition-colors">
        <div className="flex items-center gap-0.5 mb-2">
          <Crown size={11} className="text-amber-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
            {t('topWinner.title')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VipAvatarFrame tier={winner.vip_tier} frameStyle={winner.vip_customization?.frameStyle}>
            <UserAvatar address={winner.address} size={28} />
          </VipAvatarFrame>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold truncate group-hover:text-amber-400 transition-colors ${getVipNameClass(winner.vip_tier, winner.vip_customization?.nameGradient)}`}>
              {displayName}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-sm font-black tabular-nums text-amber-400">+{payout}</span>
              <GameTokenIcon size={10} />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Compact Staking Widget ──────────────────────────────

function StakingWidget() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<StakingStats | null>(null);

  const refresh = useCallback(async () => {
    try { setStats(await fetchStakingStats()); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!stats || (stats.totalDistributed === 0 && stats.totalStakers === 0)) return null;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1 mb-1.5">
        <TrendingUp size={11} className="text-violet-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/70">
          {t('staking.launchPayouts')}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold tabular-nums text-emerald-400">{formatNumber(stats.totalDistributed)}</span>
        <span className="text-[10px] text-[var(--color-text-secondary)]">AXM</span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-[var(--color-text-secondary)]">
          {stats.totalStakers} {t('staking.stakers').toLowerCase()}
        </span>
        <span className="text-[9px] font-bold text-emerald-400/80 bg-emerald-500/10 rounded px-1.5 py-0.5">
          20% {t('staking.ofCommission')}
        </span>
      </div>
    </div>
  );
}

// ─── Mini Leaderboard (Top 5) ────────────────────────────

function MiniLeaderboard() {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<'wins' | 'wagered' | 'win_rate'>('wins');
  const { data, isLoading } = useLeaderboard(sortBy);
  const { address } = useWalletContext();

  const top5 = data?.slice(0, 5) ?? [];

  const sortLabels = {
    wins: t('leaderboard.wins'),
    wagered: t('leaderboard.volume'),
    win_rate: t('leaderboard.winRateTab'),
  } as const;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Trophy size={11} className="text-[var(--color-primary)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {t('game.topPlayers')}
          </span>
        </div>
      </div>

      {/* Sort pills */}
      <div className="flex gap-1 mb-2">
        {(['wins', 'wagered', 'win_rate'] as const).map(id => (
          <button key={id} type="button" onClick={() => setSortBy(id)}
            className={`px-2 py-0.5 text-[9px] font-medium rounded-md transition-colors ${
              sortBy === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}>
            {sortLabels[id]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
        </div>
      ) : top5.length === 0 ? (
        <p className="text-[10px] text-[var(--color-text-secondary)] text-center py-3">{t('leaderboard.noPlayers')}</p>
      ) : (
        <div className="space-y-0.5">
          {top5.map((entry) => {
            const isMe = !!address && entry.address.toLowerCase() === address.toLowerCase();
            const rankEmoji = entry.rank === 1 ? '\u{1F947}' : entry.rank === 2 ? '\u{1F948}' : entry.rank === 3 ? '\u{1F949}' : null;
            return (
              <Link key={entry.address} href={`/game/profile/${entry.address}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                  isMe ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-surface-hover)]'
                }`}>
                <span className="text-[11px] w-4 text-center shrink-0">
                  {rankEmoji ?? <span className="text-[var(--color-text-secondary)] font-bold">{entry.rank}</span>}
                </span>
                <UserAvatar address={entry.address} size={20} />
                <span className={`text-[11px] font-medium truncate flex-1 ${getVipNameClass(entry.vip_tier, entry.vip_customization?.nameGradient)}`}>
                  {entry.nickname || shortAddr(entry.address)}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-[var(--color-text-secondary)] shrink-0">
                  {sortBy === 'wins' ? `${entry.wins}W` :
                    sortBy === 'wagered' ? formatLaunch(entry.total_wagered) :
                    `${(entry.win_rate * 100).toFixed(0)}%`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────

export function GameLeftPanel() {
  return (
    <aside className="hidden xl:flex flex-col w-[260px] shrink-0 overflow-y-auto overflow-x-hidden py-4 pl-4 pr-3 space-y-3 scrollbar-hide border-r border-[var(--color-border)]/50">
      <BalanceWidget />
      <JackpotWidget />
      <TopWinnerWidget />
      <StakingWidget />
      <MiniLeaderboard />
    </aside>
  );
}
