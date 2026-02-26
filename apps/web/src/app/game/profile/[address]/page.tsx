'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { usePlayerProfile } from '@/hooks/use-player-profile';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { UserAvatar, LaunchTokenIcon } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLaunch, fromMicroLaunch } from '@coinflip/shared/constants';
import { ArrowLeft, Copy, Check, Trophy, Skull, Swords, Award } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import Link from 'next/link';

const REACTION_EMOJIS = ['👍', '🔥', '💎', '🎯', '👑', '💪', '🤝', '⚡'];

/** All possible achievements with their emoji icons */
const ACHIEVEMENT_DEFS: { id: string; icon: string }[] = [
  { id: 'first_win', icon: '🎯' },
  { id: 'wins_10', icon: '⭐' },
  { id: 'wins_50', icon: '🌟' },
  { id: 'wins_100', icon: '💫' },
  { id: 'veteran', icon: '🎖️' },
  { id: 'legend', icon: '👑' },
  { id: 'high_roller', icon: '🎲' },
  { id: 'whale', icon: '🐋' },
  { id: 'volume_1k', icon: '📊' },
  { id: 'volume_10k', icon: '💰' },
  { id: 'volume_100k', icon: '🏦' },
  { id: 'profitable', icon: '📈' },
  { id: 'streak_3', icon: '🔥' },
  { id: 'streak_5', icon: '🔥' },
  { id: 'streak_10', icon: '⚡' },
];

function truncAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-center">
      <p className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color ?? ''}`}>{value}</p>
    </div>
  );
}

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawAddress = params.address as string;
  const { t } = useTranslation();
  const { address: myAddress } = useWalletContext();
  const { data: profile, isLoading, error } = usePlayerProfile(rawAddress);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [reactingEmoji, setReactingEmoji] = useState<string | null>(null);

  const isOwnProfile = myAddress?.toLowerCase() === rawAddress?.toLowerCase();

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
        await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ emoji }),
        });
      }
      // Refetch profile to get updated reactions
      queryClient.invalidateQueries({ queryKey: ['/api/v1/users', rawAddress] });
    } catch {
      // Silently fail
    } finally {
      setReactingEmoji(null);
    }
  }, [myAddress, isOwnProfile, reactingEmoji, profile?.my_reaction, rawAddress, queryClient]);

  // Loading state
  if (isLoading) {
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
        <Skeleton className="h-6 w-32 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
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

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft size={16} />
        {t('playerProfile.back')}
      </button>

      {/* Hero section */}
      <div className="flex items-center gap-4">
        <UserAvatar address={profile.address} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">
            {profile.nickname || truncAddr(profile.address)}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[var(--color-text-secondary)] font-mono truncate">
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

      {/* Reactions section */}
      {!isOwnProfile && myAddress && (
        <div className="flex flex-wrap items-center gap-1.5">
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
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all active:scale-95 disabled:opacity-60 ${
                  isMyReaction
                    ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 ring-1 ring-[var(--color-primary)]/20'
                    : count > 0
                      ? 'bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                      : 'bg-[var(--color-surface)]/50 border border-[var(--color-border)]/50 hover:border-[var(--color-border)] opacity-60 hover:opacity-100'
                }`}
                title={isMyReaction ? t('playerProfile.removeReaction') : t('playerProfile.reactToProfile')}
              >
                <span className="text-sm">{emoji}</span>
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
        <div className="flex flex-wrap items-center gap-1.5">
          {profile.reactions.map((r) => (
            <span
              key={r.emoji}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1 text-xs"
            >
              <span className="text-sm">{r.emoji}</span>
              <span className="text-[10px] font-bold tabular-nums text-[var(--color-text-secondary)]">{r.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Stats grid */}
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

      {/* Achievements */}
      {profile.achievements && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-bold">{t('playerProfile.achievements')}</h2>
            </div>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {t('playerProfile.achievementCount', {
                count: profile.achievements.earned.length,
                total: ACHIEVEMENT_DEFS.length,
              })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ACHIEVEMENT_DEFS.map((ach) => {
              const isEarned = profile.achievements.earned.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={`rounded-xl border p-2.5 text-center transition-all ${
                    isEarned
                      ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] opacity-40'
                  }`}
                  title={t(`playerProfile.ach_${ach.id}_desc`)}
                >
                  <span className={`text-xl ${isEarned ? '' : 'grayscale'}`}>{ach.icon}</span>
                  <p className={`text-[9px] font-medium mt-1 leading-tight ${
                    isEarned ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
                  }`}>
                    {t(`playerProfile.ach_${ach.id}`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Head to Head section */}
      {profile.h2h && !isOwnProfile && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Swords size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-bold">{t('playerProfile.h2hTitle')}</h2>
          </div>
          {profile.h2h.total_games > 0 ? (
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-[var(--color-success)]">{profile.h2h.your_wins}</p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">{t('playerProfile.h2hYou')}</p>
              </div>
              <div className="text-center px-4">
                <p className="text-xs text-[var(--color-text-secondary)] font-medium">
                  {t('playerProfile.h2hGames', { count: profile.h2h.total_games })}
                </p>
              </div>
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-[var(--color-danger)]">{profile.h2h.their_wins}</p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">{t('playerProfile.h2hThem')}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-secondary)] text-center py-2">
              {t('playerProfile.h2hNoGames')}
            </p>
          )}
        </div>
      )}

      {/* Recent bets */}
      <div>
        <h2 className="text-sm font-bold mb-3">{t('playerProfile.recentBets')}</h2>
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

              // Determine opponent
              const isMaker = bet.maker_user_id === rawAddress || bet.maker.toLowerCase() === rawAddress.toLowerCase();
              const opponentAddr = isMaker ? bet.acceptor : bet.maker;
              const opponentNick = isMaker ? bet.acceptor_nickname : bet.maker_nickname;

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
                      ? <Trophy size={14} className="text-[var(--color-success)]" />
                      : <Skull size={14} className="text-[var(--color-danger)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums">{formatLaunch(Number(bet.amount))}</span>
                      <LaunchTokenIcon size={36} />
                    </div>
                    {opponentAddr && (
                      <Link
                        href={`/game/profile/${opponentAddr}`}
                        className="flex items-center gap-1 mt-0.5 group/opponent"
                      >
                        <UserAvatar address={opponentAddr} size={12} />
                        <span className="text-[10px] text-[var(--color-text-secondary)] group-hover/opponent:text-[var(--color-text)] transition-colors truncate">
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
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">{t('playerProfile.noBets')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
