'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { formatLaunch, fromMicroLaunch, COMMISSION_BPS } from '@coinflip/shared/constants';
import { Crown, Flame, Zap, Coins, Clock, Gem, Sparkles } from 'lucide-react';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { VipBadge } from '@/components/ui/vip-badge';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';

export interface BetCardProps {
  id: string;
  maker: string;
  /** Maker display name (nickname) */
  makerNickname?: string | null;
  /** Amount in micro-LAUNCH (raw from API) */
  amount: number;
  status: string;
  createdAt: Date;
  /** ISO datetime — reveal deadline (only when status=accepted) */
  revealDeadline?: string | null;
  /** ISO datetime — when the open bet expires (auto-cancel) */
  expiresAt?: string | null;
  /** ISO datetime — when the bet was accepted */
  acceptedAt?: string | null;
  /** Winner address (when resolved) */
  winner?: string | null;
  /** Acceptor address */
  acceptor?: string | null;
  isMine?: boolean;
  /** Whether the current user is the acceptor of this bet */
  isAcceptor?: boolean;
  /** Index in the list for stagger animation (0-based) */
  index?: number;
  /** ID of the bet currently being acted upon (for loading states) */
  pendingBetId?: string | null;
  /** Which action is pending */
  pendingAction?: 'cancel' | 'accept' | null;
  /** This bet was recently accepted by current user, show processing UI */
  isAccepting?: boolean;
  /** VIP tier of the maker */
  makerVipTier?: string | null;
  /** Whether this bet is boosted */
  isBoosted?: boolean;
  /** Whether this bet is pinned */
  isPinned?: boolean;
  /** Pin slot number (1-3) */
  pinSlot?: number | null;
  onAccept?: (id: string) => void;
  onCancel?: (id: string) => void;
}

/** Live countdown hook — updates every second */
function useCountdown(targetDate: Date | null): {
  remaining: number;
  formatted: string;
  isExpired: boolean;
  urgency: 'normal' | 'warning' | 'critical';
} {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetDate) return;
    const remaining = Math.max(0, targetDate.getTime() - Date.now());
    const ms = remaining < 3600_000 ? 1000 : 10_000;
    const interval = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(interval);
  }, [targetDate?.getTime() ?? null]);

  if (!targetDate) return { remaining: 0, formatted: '--:--', isExpired: false, urgency: 'normal' };

  const remaining = Math.max(0, Math.floor((targetDate.getTime() - now) / 1000));
  const isExpired = remaining <= 0;

  let formatted: string;
  if (remaining >= 3600) {
    const hrs = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    formatted = `${hrs}h ${mins}m`;
  } else {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const urgency = remaining <= 30 ? 'critical'
    : remaining <= 300 ? 'warning'
    : 'normal';

  return { remaining, formatted, isExpired, urgency };
}

function truncAddr(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Tier-based styles for bet value ranges */
function getTier(humanAmount: number): {
  border: string;
  glow: string;
  gradient: string;
  icon: ReactNode;
  tier: string;
  /** Extra CSS class for animated border overlay */
  borderGlowClass: string;
  /** Extra CSS class for animated glow */
  animGlowClass: string;
} {
  // Celestial: ≥ 5,000 LAUNCH — rainbow holographic
  if (humanAmount >= 5000) {
    return {
      border: 'border-purple-400/40',
      glow: '',
      gradient: 'from-purple-500/8 via-pink-500/5 to-blue-500/5',
      icon: <Sparkles size={22} className="text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" />,
      tier: 'celestial',
      borderGlowClass: 'border-glow-celestial',
      animGlowClass: 'animate-celestial-glow',
    };
  }
  // Mythic: ≥ 1,000 LAUNCH — crimson/fire
  if (humanAmount >= 1000) {
    return {
      border: 'border-red-400/35',
      glow: '',
      gradient: 'from-red-500/8 via-orange-500/5 to-red-500/3',
      icon: <Gem size={22} className="text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />,
      tier: 'mythic',
      borderGlowClass: 'border-glow-mythic',
      animGlowClass: 'animate-mythic-glow',
    };
  }
  // Legendary: ≥ 500 LAUNCH — gold/amber
  if (humanAmount >= 500) {
    return {
      border: 'border-amber-400/40',
      glow: 'shadow-[0_0_24px_rgba(251,191,36,0.12)]',
      gradient: 'from-amber-500/8 via-transparent to-yellow-500/5',
      icon: <Crown size={22} className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />,
      tier: 'legendary',
      borderGlowClass: 'border-glow-gold',
      animGlowClass: '',
    };
  }
  // Epic: ≥ 100 LAUNCH — purple
  if (humanAmount >= 100) {
    return {
      border: 'border-purple-400/30',
      glow: 'shadow-[0_0_18px_rgba(168,85,247,0.1)]',
      gradient: 'from-purple-500/8 via-transparent to-indigo-500/5',
      icon: <Flame size={22} className="text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />,
      tier: 'epic',
      borderGlowClass: '',
      animGlowClass: '',
    };
  }
  // Rare: ≥ 10 LAUNCH — sky/cyan
  if (humanAmount >= 10) {
    return {
      border: 'border-sky-400/20',
      glow: 'shadow-[0_0_12px_rgba(56,189,248,0.08)]',
      gradient: 'from-sky-500/5 via-transparent to-cyan-500/3',
      icon: <Zap size={20} className="text-sky-400 drop-shadow-[0_0_4px_rgba(56,189,248,0.4)]" />,
      tier: 'rare',
      borderGlowClass: '',
      animGlowClass: '',
    };
  }
  // Common: < 10 LAUNCH — gray
  return {
    border: 'border-[var(--color-border)]',
    glow: '',
    gradient: 'from-white/[0.02] via-transparent to-white/[0.01]',
    icon: <Coins size={18} className="text-zinc-400" />,
    tier: 'common',
    borderGlowClass: '',
    animGlowClass: '',
  };
}

const STATUS_CONFIG: Record<string, { textKey: string; color: string; bgClass: string }> = {
  open: { textKey: 'bets.waiting', color: 'var(--color-success)', bgClass: 'bg-emerald-500/10 text-emerald-400' },
  accepting: { textKey: 'bets.accepting', color: 'var(--color-primary)', bgClass: 'bg-indigo-500/10 text-indigo-400' },
  accepted: { textKey: 'bets.deciding', color: 'var(--color-warning)', bgClass: 'bg-amber-500/10 text-amber-400' },
  revealed: { textKey: 'bets.completed', color: 'var(--color-primary)', bgClass: 'bg-indigo-500/10 text-indigo-400' },
  canceling: { textKey: 'bets.canceling', color: 'var(--color-text-secondary)', bgClass: 'bg-zinc-500/10 text-zinc-400' },
  canceled: { textKey: 'bets.canceled', color: 'var(--color-text-secondary)', bgClass: 'bg-zinc-500/10 text-zinc-400' },
  timeout_claimed: { textKey: 'bets.timeout', color: 'var(--color-danger)', bgClass: 'bg-red-500/10 text-red-400' },
};

export function BetCard({
  id, maker, makerNickname, amount, status, createdAt,
  revealDeadline, expiresAt, acceptedAt, winner, acceptor,
  isMine = false, isAcceptor = false, index = 0, pendingBetId, pendingAction,
  isAccepting: isAcceptingProp = false,
  makerVipTier, isBoosted, isPinned, pinSlot,
  onAccept, onCancel,
}: BetCardProps) {
  const { t } = useTranslation();
  const humanAmount = fromMicroLaunch(amount);
  const tier = getTier(humanAmount);
  const statusInfo = STATUS_CONFIG[status] ?? { textKey: status, color: 'var(--color-text-secondary)', bgClass: 'bg-zinc-500/10 text-zinc-400' };
  const winAmount = humanAmount * 2 * (1 - COMMISSION_BPS / 10000);

  // Live countdown for accepted bets (reveal deadline)
  const deadlineDate = useMemo(
    () => (revealDeadline ? new Date(revealDeadline) : null),
    [revealDeadline],
  );
  const countdown = useCountdown(status === 'accepted' ? deadlineDate : null);

  // Live countdown for open bets (expiration)
  const expiryDate = useMemo(
    () => (expiresAt ? new Date(expiresAt) : null),
    [expiresAt],
  );
  const expiryCountdown = useCountdown(status === 'open' ? expiryDate : null);
  const isExpiringSoon = expiryCountdown.remaining > 0 && expiryCountdown.remaining <= 30;

  const isThisPending = pendingBetId === id;
  const isCanceling = isThisPending && pendingAction === 'cancel';
  const isAcceptingLocal = isThisPending && pendingAction === 'accept';
  const isAnyPending = !!pendingBetId;
  const showAcceptingState = isAcceptingLocal || isAcceptingProp;

  const staggerClass = index < 10 ? `stagger-${index + 1}` : '';

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl border bg-gradient-to-br
        ${tier.gradient} ${tier.border} ${tier.glow} ${tier.animGlowClass}
        bg-[var(--color-surface)] p-3 card-hover animate-fade-up ${staggerClass}
        transition-all duration-300
        ${tier.borderGlowClass}
      `}
    >
      {/* Ambient glow on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--color-primary)]/0 to-[var(--color-primary)]/0 group-hover:from-[var(--color-primary)]/[0.03] group-hover:to-transparent transition-all duration-500 pointer-events-none" />

      {/* Shimmer sweep for mythic+ tiers */}
      {(tier.tier === 'mythic' || tier.tier === 'celestial') && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer pointer-events-none" />
      )}

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

      <div className="relative z-10">
        {/* Top row: Role tag + Status */}
        <div className="flex items-center justify-between mb-1.5">
          {(isMine || isAcceptor) ? (
            <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white ${
              isMine
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500'
            }`}>
              {isMine ? t('bets.yourBet') : t('bets.youAccepted')}
            </span>
          ) : <span />}
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${statusInfo.bgClass}`}>
            {t(statusInfo.textKey)}
          </span>
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center shrink-0">{tier.icon}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold tabular-nums tracking-tight">{formatLaunch(amount)}</span>
            <LaunchTokenIcon size={44} />
          </div>
        </div>

        {/* Middle: Maker + Timer */}
        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] mb-2">
          <Link href={`/game/profile/${maker}`} className="flex items-center gap-1.5 min-w-0 group/maker" onClick={(e) => e.stopPropagation()}>
            <VipAvatarFrame tier={makerVipTier}>
              <UserAvatar address={maker} size={16} />
            </VipAvatarFrame>
            <span className={`font-mono opacity-80 truncate group-hover/maker:opacity-100 group-hover/maker:text-[var(--color-primary)] transition-colors ${getVipNameClass(makerVipTier)}`}>{makerNickname || truncAddr(maker)}</span>
            <VipBadge tier={makerVipTier} />
            {isPinned && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">PIN</span>}
            {isBoosted && !isPinned && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold">&uarr;</span>}
          </Link>
          {status === 'open' && expiryDate && !expiryCountdown.isExpired ? (
            <span className={`flex items-center gap-1 font-mono tabular-nums ${
              expiryCountdown.urgency === 'critical' ? 'text-red-400 animate-pulse font-bold' :
              expiryCountdown.urgency === 'warning' ? 'text-amber-400 font-medium' :
              'opacity-60'
            }`}>
              <Clock size={11} />
              {expiryCountdown.formatted}
            </span>
          ) : status === 'open' && expiryCountdown.isExpired ? (
            <span className="text-red-400 font-bold text-[9px]">{t('bets.expired')}</span>
          ) : (
            <span className="opacity-60">{timeAgo(createdAt)} ago</span>
          )}
        </div>

        {/* Win info bar */}
        <div className="relative rounded-lg bg-gradient-to-r from-emerald-500/5 to-transparent border border-emerald-500/10 px-2.5 py-1.5 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--color-text-secondary)]">{t('bets.potentialWin')}</span>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 tabular-nums">
              +{winAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <LaunchTokenIcon size={32} />
            </span>
          </div>
        </div>

        {/* Canceling state */}
        {status === 'canceling' && (
          <div className="rounded-lg bg-zinc-500/10 px-2.5 py-2 text-center text-[11px] text-zinc-400">
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400/30 border-t-zinc-400" />
              {t('bets.canceling')}
            </span>
          </div>
        )}

        {/* Accept button — accepting state */}
        {status === 'open' && !isMine && showAcceptingState && (
          <div className="rounded-lg bg-indigo-500/10 px-2.5 py-2 text-center text-[11px] text-indigo-400">
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
              {t('bets.accepting')}
            </span>
          </div>
        )}

        {/* Accept button — disabled if expired or expiring within 30s */}
        {status === 'open' && !isMine && onAccept && !showAcceptingState && (
          isExpiringSoon || expiryCountdown.isExpired ? (
            <div className="w-full rounded-lg bg-zinc-500/10 border border-zinc-500/20 px-3 py-2 text-center text-[11px] text-zinc-400">
              {expiryCountdown.isExpired ? t('bets.betExpired') : t('bets.expiringSoon')}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAccept(id)}
              className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.25)] active:scale-[0.98] min-h-[40px]"
            >
              {t('bets.acceptFlip')}
            </button>
          )
        )}

        {/* Cancel button */}
        {status === 'open' && isMine && onCancel && (
          <button
            type="button"
            onClick={() => onCancel(id)}
            disabled={isAnyPending}
            className="w-full rounded-lg border border-zinc-700/50 px-3 py-2 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-zinc-800/50 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
          >
            {isCanceling ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                {t('bets.canceling')}
              </span>
            ) : t('bets.cancelBet')}
          </button>
        )}

        {/* Processing states */}
        {status === 'accepting' && (
          <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/10 px-2.5 py-2 text-center text-[11px] text-indigo-400">
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
              {t('common.confirming')}
            </span>
          </div>
        )}

        {status === 'accepted' && (
          <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${
            countdown.urgency === 'critical'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : countdown.urgency === 'warning'
                ? 'bg-amber-500/10 border-amber-500/15 text-amber-400'
                : 'bg-amber-500/10 border-amber-500/10 text-amber-400'
          }`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                {t('bets.determiningWinner')}
              </span>
              {deadlineDate && (
                <span className={`font-mono font-bold tabular-nums ${
                  countdown.urgency === 'critical' ? 'text-red-400 animate-pulse' : ''
                }`}>
                  {countdown.formatted}
                </span>
              )}
            </div>
            {/* Progress bar */}
            {deadlineDate && countdown.remaining > 0 && (
              <div className="mt-1.5 h-1 rounded-full bg-black/20 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                    countdown.urgency === 'critical' ? 'bg-red-500' :
                    countdown.urgency === 'warning' ? 'bg-amber-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, (countdown.remaining / 300) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
