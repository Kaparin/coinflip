'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { usePlayerProfile } from '@/hooks/use-player-profile';
import { useUserAnnouncements } from '@/hooks/use-news';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { UserAvatar, LaunchTokenIcon } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { VipBadge } from '@/components/ui/vip-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLaunch, fromMicroLaunch } from '@coinflip/shared/constants';
import { ArrowLeft, Copy, Check, ChevronDown, ChevronLeft, ChevronRight, X, Loader2, Megaphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import Link from 'next/link';
import {
  GiTrophy,
  GiCrossedSwords,
  GiCrownCoin,
  GiCoins,
  GiChainLightning,
  GiChart,
  GiSwordClash,
  GiOpenTreasureChest,
} from 'react-icons/gi';
import type { IconType } from 'react-icons';

// ─── Constants ───────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '🔥', '💎', '🎯', '👑', '💪', '🤝', '⚡'];
const PAGE_SIZE = 10;

const TIER_COLORS = [
  '', // tier 0 - locked
  'from-amber-700 to-amber-600',       // Bronze
  'from-gray-400 to-gray-300',          // Silver
  'from-yellow-500 to-amber-400',       // Gold
  'from-cyan-400 to-teal-300',          // Platinum
  'from-violet-400 to-indigo-300',      // Diamond
] as const;

const TIER_BORDER_COLORS = [
  'border-[var(--color-border)]',       // locked
  'border-amber-700/40',                // Bronze
  'border-gray-400/40',                 // Silver
  'border-yellow-500/40',               // Gold
  'border-cyan-400/40',                 // Platinum
  'border-violet-400/40',               // Diamond
] as const;

const TIER_BG = [
  'bg-[var(--color-surface)]',          // locked
  'bg-amber-700/5',                     // Bronze
  'bg-gray-400/5',                      // Silver
  'bg-yellow-500/5',                    // Gold
  'bg-cyan-400/5',                      // Platinum
  'bg-violet-400/5',                    // Diamond
] as const;

const TIER_KEYS = ['', 'tierBronze', 'tierSilver', 'tierGold', 'tierPlatinum', 'tierDiamond'] as const;

// ─── Achievement Category Definitions ────────────────────

interface AchievementTier {
  threshold: number;
  label: string; // formatted threshold for display
}

interface AchievementCategory {
  id: string;
  icon: IconType;
  tiers: AchievementTier[];
  getValue: (p: AchProgressData) => number;
}

interface AchProgressData {
  wins: number;
  total_bets: number;
  max_bet: number;      // in micro
  total_wagered: number; // in micro
  max_win_streak: number;
  net_pnl: number;      // in micro
  total_won: number;     // in micro
}

const MICRO = 1_000_000;

const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  {
    id: 'victor',
    icon: GiTrophy,
    tiers: [
      { threshold: 1, label: '1' },
      { threshold: 10, label: '10' },
      { threshold: 50, label: '50' },
      { threshold: 100, label: '100' },
      { threshold: 250, label: '250' },
    ],
    getValue: (p) => p.wins,
  },
  {
    id: 'warrior',
    icon: GiCrossedSwords,
    tiers: [
      { threshold: 10, label: '10' },
      { threshold: 50, label: '50' },
      { threshold: 100, label: '100' },
      { threshold: 500, label: '500' },
      { threshold: 1000, label: '1K' },
    ],
    getValue: (p) => p.total_bets,
  },
  {
    id: 'high_roller',
    icon: GiCrownCoin,
    tiers: [
      { threshold: 50 * MICRO, label: '50' },
      { threshold: 100 * MICRO, label: '100' },
      { threshold: 500 * MICRO, label: '500' },
      { threshold: 1000 * MICRO, label: '1K' },
      { threshold: 5000 * MICRO, label: '5K' },
    ],
    getValue: (p) => p.max_bet,
  },
  {
    id: 'volume',
    icon: GiCoins,
    tiers: [
      { threshold: 1_000 * MICRO, label: '1K' },
      { threshold: 10_000 * MICRO, label: '10K' },
      { threshold: 50_000 * MICRO, label: '50K' },
      { threshold: 100_000 * MICRO, label: '100K' },
      { threshold: 500_000 * MICRO, label: '500K' },
    ],
    getValue: (p) => p.total_wagered,
  },
  {
    id: 'streak',
    icon: GiChainLightning,
    tiers: [
      { threshold: 3, label: '3' },
      { threshold: 5, label: '5' },
      { threshold: 7, label: '7' },
      { threshold: 10, label: '10' },
      { threshold: 15, label: '15' },
    ],
    getValue: (p) => p.max_win_streak,
  },
  {
    id: 'profit',
    icon: GiChart,
    tiers: [
      { threshold: 1, label: '>0' },
      { threshold: 5_000 * MICRO, label: '5K' },
      { threshold: 25_000 * MICRO, label: '25K' },
      { threshold: 100_000 * MICRO, label: '100K' },
      { threshold: 500_000 * MICRO, label: '500K' },
    ],
    getValue: (p) => p.net_pnl > 0 ? p.net_pnl : 0,
  },
];

// ─── Helpers ─────────────────────────────────────────────

function truncAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function computeTier(cat: AchievementCategory, progressData: AchProgressData): number {
  const val = cat.getValue(progressData);
  let tier = 0;
  for (let i = 0; i < cat.tiers.length; i++) {
    if (val >= cat.tiers[i]!.threshold) tier = i + 1;
  }
  return tier;
}

// ─── Sub-Components ──────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <span className="text-[var(--color-primary)] shrink-0">{icon}</span>
        <span className="text-sm font-bold flex-1">{title}</span>
        {badge}
        <ChevronDown
          size={16}
          className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-2.5 text-center">
      <p className="text-[9px] text-[var(--color-text-secondary)] uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-base font-bold tabular-nums ${color ?? ''}`}>{value}</p>
    </div>
  );
}

function AchievementModal({
  cat,
  tier,
  progressData,
  onClose,
  t,
}: {
  cat: AchievementCategory;
  tier: number;
  progressData: AchProgressData;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const Icon = cat.icon;
  const currentValue = cat.getValue(progressData);
  const nextTier = tier < cat.tiers.length ? cat.tiers[tier] : null;
  const currentTierDef = tier > 0 ? cat.tiers[tier - 1] : null;

  // Progress bar to next tier
  let progressPct = 0;
  if (tier >= cat.tiers.length) {
    progressPct = 100;
  } else if (nextTier) {
    const base = currentTierDef ? currentTierDef.threshold : 0;
    const range = nextTier.threshold - base;
    progressPct = range > 0 ? Math.min(100, ((currentValue - base) / range) * 100) : 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <X size={16} />
        </button>

        {/* Icon + tier */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${
            tier > 0 ? TIER_BORDER_COLORS[tier] ?? '' : 'border-[var(--color-border)]'
          } ${tier > 0 ? TIER_BG[tier] ?? '' : 'bg-[var(--color-surface)]'}`}>
            <Icon size={32} className={tier > 0 ? `text-${tier >= 4 ? 'cyan' : tier >= 3 ? 'yellow' : tier >= 2 ? 'gray' : 'amber'}-${tier >= 4 ? '400' : '500'}` : 'text-[var(--color-text-secondary)]'} style={{
              color: tier === 0 ? 'var(--color-text-secondary)' : tier === 1 ? '#b45309' : tier === 2 ? '#9ca3af' : tier === 3 ? '#eab308' : tier === 4 ? '#22d3ee' : '#a78bfa',
            }} />
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold">{t(`playerProfile.cat_${cat.id}`)}</h3>
            {tier > 0 ? (
              <span className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r ${TIER_COLORS[tier]} text-white`}>
                {t(`playerProfile.${TIER_KEYS[tier]}`)} · {t('playerProfile.achLevel', { level: tier })}
              </span>
            ) : (
              <span className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
                {t('playerProfile.achLocked')}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-[var(--color-text-secondary)] text-center mb-4">
          {t(`playerProfile.cat_${cat.id}_desc`)}
        </p>

        {/* Tier progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[var(--color-text-secondary)]">
              {tier >= cat.tiers.length
                ? t('playerProfile.achMaxLevel')
                : nextTier
                  ? t('playerProfile.achNextLevel', { target: nextTier.label })
                  : ''
              }
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                tier >= cat.tiers.length
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-400'
                  : 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* All tier levels */}
          <div className="flex justify-between mt-3">
            {cat.tiers.map((tierDef, i) => {
              const tierNum = i + 1;
              const unlocked = tier >= tierNum;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    unlocked
                      ? `bg-gradient-to-br ${TIER_COLORS[tierNum]} text-white`
                      : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
                  }`}>
                    {tierNum}
                  </div>
                  <span className={`text-[8px] ${unlocked ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}`}>
                    {tierDef.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawAddress = params.address as string;
  const { t } = useTranslation();
  const { address: myAddress } = useWalletContext();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const { data: profile, isLoading, error, isFetching, isPlaceholderData } = usePlayerProfile(rawAddress, page, PAGE_SIZE);
  const { data: userAnnouncements } = useUserAnnouncements(rawAddress);

  const [copied, setCopied] = useState(false);
  const [reactingEmoji, setReactingEmoji] = useState<string | null>(null);
  const [selectedAch, setSelectedAch] = useState<string | null>(null);

  const isOwnProfile = myAddress?.toLowerCase() === rawAddress?.toLowerCase();

  // Compute achievement data from progress
  const achProgressData = useMemo((): AchProgressData | null => {
    if (!profile?.achievements?.progress) return null;
    const p = profile.achievements.progress;
    const totalWon = Number(p.total_won);
    const totalWagered = Number(p.total_wagered);
    return {
      wins: p.wins,
      total_bets: p.total_bets,
      max_bet: Number(p.max_bet),
      total_wagered: totalWagered,
      max_win_streak: p.max_win_streak,
      net_pnl: totalWon - totalWagered,
      total_won: totalWon,
    };
  }, [profile?.achievements]);

  const achievementTiers = useMemo(() => {
    if (!achProgressData) return {};
    const result: Record<string, number> = {};
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      result[cat.id] = computeTier(cat, achProgressData);
    }
    return result;
  }, [achProgressData]);

  const totalEarned = useMemo(() => {
    return Object.values(achievementTiers).reduce((sum, tier) => sum + tier, 0);
  }, [achievementTiers]);

  const totalPossible = ACHIEVEMENT_CATEGORIES.length * 5;

  const handleCopy = () => {
    navigator.clipboard.writeText(rawAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReaction = useCallback(async (emoji: string) => {
    if (!myAddress || isOwnProfile || reactingEmoji) return;
    setReactingEmoji(emoji);
    try {
      const isRemoving = profile?.my_reaction === emoji;
      const url = `${API_URL}/api/v1/users/${rawAddress}/reaction`;
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('coinflip_auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (isRemoving) {
        await fetch(url, { method: 'DELETE', credentials: 'include', headers });
      } else {
        await fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ emoji }) });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users', rawAddress] });
    } catch {
      // Silently fail
    } finally {
      setReactingEmoji(null);
    }
  }, [myAddress, isOwnProfile, reactingEmoji, profile?.my_reaction, rawAddress, queryClient]);

  // Loading state
  if (isLoading && page === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-3 w-56 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          {t('playerProfile.back')}
        </button>
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-16 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">{t('playerProfile.playerNotFound')}</p>
        </div>
      </div>
    );
  }

  const { stats } = profile;
  const winRate = stats.total_bets > 0 ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : '0';
  const totalWagered = fromMicroLaunch(Number(stats.total_wagered));
  const totalWon = fromMicroLaunch(Number(stats.total_won));
  const netPnl = totalWon - totalWagered;
  const netPnlStr = netPnl >= 0 ? `+${netPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : netPnl.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const memberDate = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const totalPages = Math.max(1, Math.ceil((profile.recent_bets_total ?? 0) / PAGE_SIZE));

  const selectedCategory = selectedAch ? ACHIEVEMENT_CATEGORIES.find((c) => c.id === selectedAch) : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3 pb-24 md:pb-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft size={16} />
        {t('playerProfile.back')}
      </button>

      {/* Hero card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-4">
          <VipAvatarFrame tier={profile.vip_tier} className="relative shrink-0">
            <div className="rounded-full overflow-hidden bg-[var(--color-bg)]">
              <UserAvatar address={profile.address} size={56} />
            </div>
          </VipAvatarFrame>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`text-lg font-bold truncate ${getVipNameClass(profile.vip_tier)}`}>
                {profile.nickname || truncAddr(profile.address)}
              </h1>
              <VipBadge tier={profile.vip_tier} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-[var(--color-text-secondary)] font-mono truncate">
                {truncAddr(profile.address)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors shrink-0"
                title={t('playerProfile.copyAddress')}
              >
                {copied ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
              {t('playerProfile.memberSince', { date: memberDate })}
            </p>
          </div>
        </div>

        {/* Telegram contact button */}
        {profile.telegram?.username && !isOwnProfile && (
          <a
            href={`https://t.me/${profile.telegram.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 mt-3 w-full rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#229ED9] active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            {t('playerProfile.sendMessage')}
          </a>
        )}

        {/* Reactions inline */}
        {!isOwnProfile && myAddress && (
          <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-[var(--color-border)]">
            {REACTION_EMOJIS.map((emoji) => {
              const reactionData = profile.reactions.find((r) => r.emoji === emoji);
              const count = reactionData?.count ?? 0;
              const isMyReaction = profile.my_reaction === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReaction(emoji)}
                  disabled={!!reactingEmoji}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all active:scale-95 disabled:opacity-60 ${
                    isMyReaction
                      ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/20'
                      : count > 0
                        ? 'bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                        : 'bg-[var(--color-bg)]/50 border border-[var(--color-border)]/50 hover:border-[var(--color-border)] opacity-50 hover:opacity-100'
                  }`}
                  title={isMyReaction ? t('playerProfile.removeReaction') : t('playerProfile.reactToProfile')}
                >
                  <span className="text-sm leading-none">{emoji}</span>
                  {count > 0 && (
                    <span className={`text-[10px] font-bold tabular-nums ${
                      isMyReaction ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Reactions display for own profile or not logged in */}
        {(isOwnProfile || !myAddress) && profile.reactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-[var(--color-border)]">
            {profile.reactions.map((r) => (
              <span
                key={r.emoji}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 text-xs"
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                <span className="text-[10px] font-bold tabular-nums text-[var(--color-text-secondary)]">{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats section (collapsible) */}
      <CollapsibleSection
        title={t('playerProfile.stats')}
        icon={<GiChart size={18} />}
        defaultOpen={true}
      >
        <div className="grid grid-cols-3 gap-2">
          <StatCard label={t('playerProfile.wins')} value={stats.wins} color="text-[var(--color-success)]" />
          <StatCard label={t('playerProfile.losses')} value={stats.losses} color="text-[var(--color-danger)]" />
          <StatCard label={t('playerProfile.winRate')} value={`${winRate}%`} />
          <StatCard label={t('playerProfile.totalWagered')} value={totalWagered.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
          <StatCard label={t('playerProfile.totalWon')} value={totalWon.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
          <StatCard
            label={t('playerProfile.netPnl')}
            value={netPnlStr}
            color={netPnl >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}
          />
        </div>
      </CollapsibleSection>

      {/* Achievements (collapsible) */}
      {achProgressData && (
        <CollapsibleSection
          title={t('playerProfile.achievements')}
          icon={<GiTrophy size={18} />}
          defaultOpen={false}
          badge={
            <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
              {totalEarned}/{totalPossible}
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            {ACHIEVEMENT_CATEGORIES.map((cat) => {
              const tier = achievementTiers[cat.id] ?? 0;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedAch(cat.id)}
                  className={`rounded-xl border p-3 text-center transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                    tier > 0
                      ? `${TIER_BORDER_COLORS[tier] ?? ''} ${TIER_BG[tier] ?? ''}`
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] opacity-50'
                  }`}
                >
                  <Icon
                    size={28}
                    style={{
                      color: tier === 0 ? 'var(--color-text-secondary)' : tier === 1 ? '#b45309' : tier === 2 ? '#9ca3af' : tier === 3 ? '#eab308' : tier === 4 ? '#22d3ee' : '#a78bfa',
                      margin: '0 auto',
                    }}
                  />
                  <p className={`text-[10px] font-bold mt-1.5 leading-tight ${
                    tier > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
                  }`}>
                    {t(`playerProfile.cat_${cat.id}`)}
                  </p>
                  {tier > 0 ? (
                    <span className={`inline-block mt-1 rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider bg-gradient-to-r ${TIER_COLORS[tier]} text-white`}>
                      {t(`playerProfile.${TIER_KEYS[tier]}`)}
                    </span>
                  ) : (
                    <span className="inline-block mt-1 rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
                      {t('playerProfile.achLocked')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Head to Head section (collapsible) */}
      {profile.h2h && !isOwnProfile && (
        <CollapsibleSection
          title={t('playerProfile.h2hTitle')}
          icon={<GiSwordClash size={18} />}
          defaultOpen={profile.h2h.total_games > 0}
        >
          {profile.h2h.total_games > 0 ? (() => {
            const myWins = profile.h2h!.your_wins;
            const theirWins = profile.h2h!.their_wins;
            const total = profile.h2h!.total_games;
            const myPct = total > 0 ? Math.round((myWins / total) * 100) : 0;
            const theirPct = total > 0 ? Math.round((theirWins / total) * 100) : 0;
            const myName = t('playerProfile.h2hYou');
            const theirName = profile.nickname || truncAddr(profile.address);
            return (
              <div className="space-y-3">
                {/* Score line */}
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-medium text-[var(--color-text-secondary)] mb-1">{myName}</p>
                    <p className="text-2xl font-bold text-[var(--color-success)]">{myWins}</p>
                    <p className="text-[9px] text-[var(--color-text-secondary)]">{t('playerProfile.h2hWins')}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 px-3">
                    <span className="text-lg font-bold text-[var(--color-text-secondary)]">:</span>
                    <span className="text-[9px] text-[var(--color-text-secondary)]">
                      {t('playerProfile.h2hGames', { count: total })}
                    </span>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-medium text-[var(--color-text-secondary)] mb-1 truncate max-w-[100px] mx-auto">{theirName}</p>
                    <p className="text-2xl font-bold text-[var(--color-danger)]">{theirWins}</p>
                    <p className="text-[9px] text-[var(--color-text-secondary)]">{t('playerProfile.h2hWins')}</p>
                  </div>
                </div>
                {/* Visual ratio bar */}
                <div className="flex h-2 rounded-full overflow-hidden bg-[var(--color-bg)] border border-[var(--color-border)]">
                  {myWins > 0 && (
                    <div
                      className="bg-[var(--color-success)] transition-all duration-300"
                      style={{ width: `${myPct}%` }}
                    />
                  )}
                  {total > myWins + theirWins && (
                    <div
                      className="bg-[var(--color-text-secondary)]/20"
                      style={{ width: `${100 - myPct - theirPct}%` }}
                    />
                  )}
                  {theirWins > 0 && (
                    <div
                      className="bg-[var(--color-danger)] transition-all duration-300"
                      style={{ width: `${theirPct}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })() : (
            <p className="text-xs text-[var(--color-text-secondary)] text-center py-2">
              {t('playerProfile.h2hNoGames')}
            </p>
          )}
        </CollapsibleSection>
      )}

      {/* Jackpot Wins (if any) */}
      {profile.jackpot_wins && profile.jackpot_wins.length > 0 && (
        <CollapsibleSection
          title={t('playerProfile.jackpotWins')}
          icon={<GiOpenTreasureChest size={18} />}
          defaultOpen={false}
          badge={
            <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
              {profile.jackpot_wins.length}
            </span>
          }
        >
          <div className="space-y-2">
            {profile.jackpot_wins.map((jw, i) => {
              const tierDisplayNames: Record<string, string> = {
                mini: t('jackpot.tiers.mini'),
                medium: t('jackpot.tiers.medium'),
                large: t('jackpot.tiers.large'),
                mega: t('jackpot.tiers.mega'),
                super_mega: t('jackpot.tiers.super_mega'),
              };
              const tierColors: Record<string, string> = {
                mini: 'text-emerald-400 bg-emerald-400/15 border-emerald-400/20',
                medium: 'text-blue-400 bg-blue-400/15 border-blue-400/20',
                large: 'text-violet-400 bg-violet-400/15 border-violet-400/20',
                mega: 'text-amber-400 bg-amber-400/15 border-amber-400/20',
                super_mega: 'text-rose-400 bg-rose-400/15 border-rose-400/20',
              };
              const colors = tierColors[jw.tierName] ?? 'text-[var(--color-text-secondary)] bg-[var(--color-bg)] border-[var(--color-border)]';
              const colorParts = colors.split(' ');
              const textColor = colorParts[0] ?? '';

              return (
                <div key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${colorParts.slice(1).join(' ')}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorParts[1] ?? ''}`}>
                    <GiOpenTreasureChest size={16} className={textColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{tierDisplayNames[jw.tierName] ?? jw.tierName} Jackpot</p>
                    {jw.wonAt && (
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        {new Date(jw.wonAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${textColor}`}>
                      +{formatLaunch(Number(jw.amount))}
                    </span>
                    <LaunchTokenIcon size={32} />
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Announcements (only if user has any) */}
      {userAnnouncements && userAnnouncements.length > 0 && (
        <CollapsibleSection
          title={t('playerProfile.announcements')}
          icon={<Megaphone size={18} />}
          defaultOpen={false}
          badge={
            <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
              {userAnnouncements.length}
            </span>
          }
        >
          <div className="space-y-2">
            {userAnnouncements.map((ann) => (
              <div
                key={ann.id}
                className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Megaphone size={12} className="text-teal-400 shrink-0" />
                  <h4 className="text-sm font-bold leading-snug truncate">{ann.title}</h4>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap line-clamp-3">
                  {ann.message}
                </p>
                <p className="text-[10px] text-[var(--color-text-secondary)] mt-1.5">
                  {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Recent bets (collapsible, paginated) */}
      <CollapsibleSection
        title={t('playerProfile.recentBets')}
        icon={<GiCrossedSwords size={18} />}
        defaultOpen={false}
        badge={
          <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
            {profile.recent_bets_total ?? profile.recent_bets.length}
          </span>
        }
      >
        {profile.recent_bets.length > 0 ? (
          <div className="space-y-2">
            {profile.recent_bets.map((bet) => {
              const isWin = bet.is_win;
              const betAmount = fromMicroLaunch(Number(bet.amount));
              const payout = fromMicroLaunch(Number(bet.payout_amount));
              const profit = isWin ? payout - betAmount : -betAmount;
              const profitStr = isWin
                ? `+${profit.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                : profit.toLocaleString('en-US', { maximumFractionDigits: 2 });

              const isMaker = bet.maker_user_id === rawAddress || bet.maker.toLowerCase() === rawAddress.toLowerCase();
              const opponentAddr = isMaker ? bet.acceptor : bet.maker;
              const opponentNick = isMaker ? bet.acceptor_nickname : bet.maker_nickname;
              const opponentVipTier = isMaker ? bet.acceptor_vip_tier : bet.maker_vip_tier;

              return (
                <div
                  key={bet.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    isWin
                      ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/5'
                      : 'border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isWin ? 'bg-[var(--color-success)]/15' : 'bg-[var(--color-danger)]/15'
                  }`}>
                    {isWin
                      ? <GiTrophy size={16} className="text-[var(--color-success)]" />
                      : <X size={14} className="text-[var(--color-danger)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums">{formatLaunch(Number(bet.amount))}</span>
                      <LaunchTokenIcon size={32} />
                    </div>
                    {opponentAddr && (
                      <Link
                        href={`/game/profile/${opponentAddr}`}
                        className="flex items-center gap-1 mt-0.5 group/opponent"
                      >
                        <VipAvatarFrame tier={opponentVipTier}>
                          <UserAvatar address={opponentAddr} size={12} />
                        </VipAvatarFrame>
                        <span className={`text-[10px] text-[var(--color-text-secondary)] group-hover/opponent:text-[var(--color-text)] transition-colors truncate ${getVipNameClass(opponentVipTier)}`}>
                          {t('playerProfile.vs')} {opponentNick || truncAddr(opponentAddr)}
                        </span>
                      </Link>
                    )}
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${
                    isWin ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                  }`}>
                    {profitStr}
                  </span>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={page === 0 || (isFetching && isPlaceholderData)}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-30 hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <ChevronLeft size={14} />
                  {t('playerProfile.prevPage')}
                </button>
                <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums flex items-center gap-1.5">
                  {isFetching && isPlaceholderData && <Loader2 size={12} className="animate-spin" />}
                  {t('playerProfile.page', { page: page + 1, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1 || (isFetching && isPlaceholderData)}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-30 hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  {t('playerProfile.nextPage')}
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">{t('playerProfile.noBets')}</p>
          </div>
        )}
      </CollapsibleSection>

      {/* Achievement detail modal */}
      {selectedCategory && achProgressData && (
        <AchievementModal
          cat={selectedCategory}
          tier={achievementTiers[selectedCategory.id] ?? 0}
          progressData={achProgressData}
          onClose={() => setSelectedAch(null)}
          t={t}
        />
      )}
    </div>
  );
}
