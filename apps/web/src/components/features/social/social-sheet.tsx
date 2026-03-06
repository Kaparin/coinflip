'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Send, Loader2, Sparkles, Pin, Gift, CheckCircle, XCircle, Heart, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { useWalletContext } from '@/contexts/wallet-context';
import { UserAvatar, LaunchTokenIcon, AxmIcon } from '@/components/ui';
import { VipBadge } from '@/components/ui/vip-badge';
import { getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useOnlineUsers,
  useFavorites,
  useAllUsers,
  useChat,
  useChatPrices,
  useFavoriteStatus,
  type SocialUser,
  type ChatMessage,
} from '@/hooks/use-social';
import { TransferModal } from './transfer-modal';

// ─── Types ────────────────────────────────────────────────

type MainTab = 'users' | 'chat';
type UsersSubTab = 'online' | 'favorites' | 'all';
type ChatStyle = 'highlighted' | 'pinned' | null;
type ChatEffect = 'confetti' | 'coins' | 'fire' | null;

interface SocialSheetProps {
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const LINK_RE = /https?:\/\/\S+|www\.\S+|\S+\.(com|net|org|io|co|me|xyz|ru|info|biz|gg|ly|link|click|top|app|site|online|store|shop)\b|t\.me\/\S+|discord\.(gg|com)\/\S+/i;

function containsLinks(text: string): boolean {
  return LINK_RE.test(text);
}

// ─── User Action Menu (mobile) ────────────────────────────

function UserActionMenu({
  user,
  onClose,
  onTransfer,
  onNavigate,
  t,
}: {
  user: SocialUser;
  onClose: () => void;
  onTransfer: (currency: 'coin' | 'axm') => void;
  onNavigate: () => void;
  t: (k: string) => string;
}) {
  const { isConnected, address } = useWalletContext();
  const { isFavorite, toggle: toggleFav, loading: favLoading } = useFavoriteStatus(
    isConnected ? user.address : undefined,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const isSelf = address === user.address;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-2 top-full mt-1 z-30 w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {isConnected && !isSelf && (
        <button
          type="button"
          onClick={() => { onTransfer('coin'); onClose(); }}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/10 hover:text-amber-300 text-amber-400"
        >
          <LaunchTokenIcon size={16} />
          {t('social.sendCoin')}
        </button>
      )}
      {isConnected && !isSelf && (
        <button
          type="button"
          onClick={() => { onTransfer('axm'); onClose(); }}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/10 hover:text-indigo-300 text-indigo-400"
        >
          <AxmIcon size={16} />
          {t('social.sendAxm')}
        </button>
      )}
      {isConnected && !isSelf && (
        <button
          type="button"
          onClick={() => { toggleFav(); }}
          disabled={favLoading}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/10 disabled:opacity-50"
        >
          <Heart size={14} className={isFavorite ? 'fill-pink-500 text-pink-500' : 'text-[var(--color-text-secondary)]'} />
          {isFavorite ? t('social.removeFavorite') : t('social.addFavorite')}
        </button>
      )}
      <Link
        href={`/game/profile/${user.address}`}
        onClick={() => { onClose(); onNavigate(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-primary)]/10"
      >
        <User size={14} className="text-[var(--color-text-secondary)]" />
        {t('social.viewProfile')}
      </Link>
    </div>
  );
}

// ─── User Card ────────────────────────────────────────────

function UserCard({
  user,
  t,
  onTransfer,
  onNavigate,
  menuOpen,
  onToggleMenu,
}: {
  user: SocialUser;
  t: (k: string, v?: Record<string, string | number>) => string;
  onTransfer: (user: SocialUser, currency: 'coin' | 'axm') => void;
  onNavigate: () => void;
  menuOpen: boolean;
  onToggleMenu: (address: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onToggleMenu(user.address)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.99] text-left"
      >
        <div className="relative shrink-0">
          <UserAvatar address={user.address} size={36} />
          {user.is_online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-success)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold truncate ${getVipNameClass(user.vip_tier, user.vip_customization?.nameGradient)}`}>
              {user.nickname || shortAddr(user.address)}
            </span>
            <VipBadge tier={user.vip_tier} badgeIcon={user.vip_customization?.badgeIcon} />
          </div>
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            {t('social.totalBets', { count: user.total_bets })}
          </span>
        </div>
      </button>

      {menuOpen && (
        <UserActionMenu
          user={user}
          onClose={() => onToggleMenu(user.address)}
          onTransfer={(currency) => { onTransfer(user, currency); }}
          onNavigate={onNavigate}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────

function UsersTab({
  onNavigate,
  onTransfer,
}: {
  onNavigate: () => void;
  onTransfer: (user: SocialUser, currency: 'coin' | 'axm') => void;
}) {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const [subTab, setSubTab] = useState<UsersSubTab>('online');
  const [search, setSearch] = useState('');
  const [openMenuAddr, setOpenMenuAddr] = useState<string | null>(null);

  const { users: onlineUsers, loading: onlineLoading } = useOnlineUsers(subTab === 'online');
  const { users: favUsers, loading: favLoading } = useFavorites(subTab === 'favorites' && isConnected);
  const { users: allUsers, loading: allLoading, nextCursor, loadMore, loadingMore } = useAllUsers(subTab === 'all', search);

  const subTabs: { key: UsersSubTab; label: string }[] = [
    { key: 'online', label: t('social.online') },
    { key: 'favorites', label: t('social.favorites') },
    { key: 'all', label: t('social.allUsers') },
  ];

  const currentUsers = subTab === 'online' ? onlineUsers : subTab === 'favorites' ? favUsers : allUsers;
  const currentLoading = subTab === 'online' ? onlineLoading : subTab === 'favorites' ? favLoading : allLoading;
  const emptyMessage = subTab === 'online' ? t('social.noUsersOnline') : subTab === 'favorites' ? t('social.noFavorites') : t('social.noUsersFound');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 px-3 pt-1 pb-2 shrink-0">
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              subTab === key
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'all' && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('social.searchPlaceholder')}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-8 pr-3 text-xs placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain px-1 min-h-0">
        {currentLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--color-text-secondary)]" />
          </div>
        ) : currentUsers.length === 0 ? (
          <p className="text-center text-xs text-[var(--color-text-secondary)] py-12">{emptyMessage}</p>
        ) : (
          <>
            {currentUsers.map((user) => (
              <UserCard
                key={user.address}
                user={user}
                t={t}
                onTransfer={onTransfer}
                onNavigate={onNavigate}
                menuOpen={openMenuAddr === user.address}
                onToggleMenu={(addr) => setOpenMenuAddr((prev) => prev === addr ? null : addr)}
              />
            ))}
            {subTab === 'all' && nextCursor && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2 text-xs text-[var(--color-primary)] font-semibold hover:underline disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('social.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Effect Animation ─────────────────────────────────────

function EffectOverlay({ effect, onDone }: { effect: ChatEffect; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (!effect) return null;

  const particles = Array.from({ length: 6 }, (_, i) => i);
  const emoji = effect === 'confetti' ? ['🎉', '✨', '🥳'] : effect === 'coins' ? ['🪙', '💰', '🏆'] : ['🔥', '⚡', '☄️'];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      {particles.map((i) => (
        <span
          key={i}
          className="absolute animate-[chatEffect_2.5s_ease-out_forwards]"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-20px',
            fontSize: `${12 + Math.random() * 14}px`,
            animationDelay: `${Math.random() * 0.8}s`,
            opacity: 0,
          }}
        >
          {emoji[i % emoji.length]}
        </span>
      ))}
    </div>
  );
}

// ─── Coin Drop Message ────────────────────────────────────

function CoinDropBubble({
  msg,
  onClaim,
  claiming,
  currentAddress,
}: {
  msg: ChatMessage;
  onClaim: (messageId: string) => void;
  claiming: string | null;
  currentAddress: string | null;
}) {
  const drop = msg.coinDrop;
  if (!drop) return null;

  const isClaimed = !!drop.claimedBy;
  const isMine = msg.address === currentAddress;
  const canClaim = !isClaimed && !isMine && !!currentAddress;
  const isClaiming = claiming === msg.id;

  return (
    <div className={`relative rounded-2xl border-2 p-3 transition-all ${
      isClaimed
        ? 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60'
        : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Link href={`/game/profile/${msg.address}`} className="shrink-0">
          <UserAvatar address={msg.address} size={24} />
        </Link>
        <Link href={`/game/profile/${msg.address}`} className={`text-xs font-semibold hover:underline ${getVipNameClass(msg.vipTier, null)}`}>
          {msg.nickname || shortAddr(msg.address)}
        </Link>
        <span className="text-[9px] text-[var(--color-text-secondary)] ml-auto">{formatTime(msg.createdAt)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`relative shrink-0 ${isClaimed ? 'grayscale' : ''}`}>
          <Image
            src="/coin-token-logo.png"
            alt="COIN"
            width={48}
            height={48}
            className={`rounded-full ${!isClaimed ? 'drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]' : ''}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-black text-amber-400">{formatLaunch(drop.amount)} COIN</div>
          {msg.message && msg.message !== `${formatLaunch(drop.amount)} COIN` && (
            <p className="text-xs text-[var(--color-text-secondary)] truncate">{msg.message}</p>
          )}
          {isClaimed && (
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{drop.claimedByNickname || shortAddr(drop.claimedBy!)}</p>
          )}
        </div>
        <div className="shrink-0">
          {isClaimed ? (
            <CheckCircle size={14} className="text-[var(--color-text-secondary)]" />
          ) : canClaim ? (
            <button
              type="button"
              onClick={() => onClaim(msg.id)}
              disabled={isClaiming}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black transition-all hover:bg-amber-400 active:scale-95 disabled:opacity-50"
            >
              {isClaiming ? <Loader2 size={14} className="animate-spin" /> : 'Grab!'}
            </button>
          ) : isMine ? (
            <Gift size={18} className="text-amber-400/50" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────

function ChatBubble({ msg, onEffect }: { msg: ChatMessage; onEffect?: (effect: ChatEffect) => void }) {
  const isHighlighted = msg.style === 'highlighted';
  const isPinned = msg.style === 'pinned';

  const triggered = useRef(false);
  useEffect(() => {
    if (triggered.current) return;
    if (msg.effect && onEffect) {
      triggered.current = true;
      onEffect(msg.effect);
    }
  }, [msg.effect, onEffect]);

  const wrapperClass = isPinned
    ? 'relative flex items-start gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border border-amber-500/25 shadow-sm shadow-amber-500/10'
    : isHighlighted
      ? 'relative flex items-start gap-2 py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-amber-500/8 to-transparent border-l-2 border-amber-400/40'
      : 'relative flex items-start gap-2 py-1';

  return (
    <div className={wrapperClass}>
      {isPinned && (
        <div className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2 py-0.5 shadow-lg shadow-amber-500/25">
          <Pin size={7} className="text-black" />
          <span className="text-[7px] font-black tracking-wider text-black uppercase">SUPER CHAT</span>
        </div>
      )}
      <Link href={`/game/profile/${msg.address}`} className="shrink-0 mt-0.5">
        <UserAvatar address={msg.address} size={isPinned ? 28 : 24} />
      </Link>
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <Link
          href={`/game/profile/${msg.address}`}
          className={`font-semibold hover:underline ${isPinned ? 'text-amber-300' : getVipNameClass(msg.vipTier, null)}`}
        >
          {msg.nickname || shortAddr(msg.address)}
        </Link>
        {msg.vipTier && <>{' '}<VipBadge tier={msg.vipTier} /></>}
        <span className="text-[9px] text-[var(--color-text-secondary)] ml-1">{formatTime(msg.createdAt)}</span>
        {msg.effect && (
          <span className="ml-1 text-[9px]">
            {msg.effect === 'confetti' ? '🎉' : msg.effect === 'coins' ? '🪙' : '🔥'}
          </span>
        )}
        <span className="text-[var(--color-text-secondary)] mx-1">&middot;</span>
        <span className={`break-words ${isPinned ? 'font-medium text-amber-100/90' : ''}`}>{msg.message}</span>
      </div>
    </div>
  );
}

// ─── Premium Selector ─────────────────────────────────────

function PremiumSelector({
  style, setStyle, effect, setEffect, prices,
  showDrop, setShowDrop, t,
}: {
  style: ChatStyle;
  setStyle: (s: ChatStyle) => void;
  effect: ChatEffect;
  setEffect: (e: ChatEffect) => void;
  prices: { highlighted: number; pinned: number; effect: number; coinDropMin: number } | null;
  showDrop: boolean;
  setShowDrop: (v: boolean) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  if (!prices) return null;

  const styleOptions: { key: ChatStyle; label: string; price: number; gradient: string }[] = [
    { key: 'highlighted', label: t('social.highlighted'), price: prices.highlighted, gradient: 'from-amber-600 to-yellow-500' },
    { key: 'pinned', label: t('social.pinned'), price: prices.pinned, gradient: 'from-orange-600 to-red-500' },
  ];

  const effectOptions: { key: ChatEffect; emoji: string }[] = [
    { key: 'confetti', emoji: '🎉' },
    { key: 'coins', emoji: '🪙' },
    { key: 'fire', emoji: '🔥' },
  ];

  return (
    <div className="space-y-2 px-1 py-2 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex gap-1.5">
        {styleOptions.map(({ key, label, price, gradient }) => {
          const active = style === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setStyle(active ? null : key); setShowDrop(false); }}
              className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 text-[10px] font-semibold transition-all border ${
                active
                  ? `bg-gradient-to-b ${gradient} text-white border-transparent shadow-lg`
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-amber-500/30'
              }`}
            >
              <span className="text-[11px]">{label}</span>
              <span className={`text-[9px] ${active ? 'text-white/80' : 'text-[var(--color-text-secondary)]'}`}>
                {formatLaunch(price)} COIN
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { setShowDrop(!showDrop); setStyle(null); setEffect(null); }}
          className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 text-[10px] font-semibold transition-all border ${
            showDrop
              ? 'bg-gradient-to-b from-emerald-500 to-teal-600 text-white border-transparent shadow-lg'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-emerald-500/30'
          }`}
        >
          <Gift size={14} />
          <span className="text-[9px]">COIN Drop</span>
        </button>
      </div>
      {!showDrop && (style === 'highlighted' || style === 'pinned') && (
        <div className="flex gap-1.5">
          {effectOptions.map(({ key, emoji }) => {
            const active = effect === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEffect(active ? null : key)}
                className={`flex-1 flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-semibold transition-all border ${
                  active
                    ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/30'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[9px]">+{formatLaunch(prices!.effect)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Coin Drop Input ──────────────────────────────────────

function CoinDropInput({
  onSend,
  sending,
  cooldown,
}: {
  onSend: (amount: number, message?: string) => void;
  sending: boolean;
  cooldown: number;
}) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const { t } = useTranslation();

  const presets = [5, 10, 50, 100];

  return (
    <div className="space-y-2 px-1 pb-1 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex gap-1.5">
        {presets.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all border ${
              amount === String(v)
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-emerald-500/30'
            }`}
          >
            {v}
          </button>
        ))}
        <input
          type="number"
          value={presets.includes(Number(amount)) ? '' : amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('social.customAmount')}
          min="1"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-center focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('social.dropMessage')}
          maxLength={200}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={() => {
            const num = Number(amount);
            if (num >= 1) onSend(num, message || undefined);
          }}
          disabled={!amount || Number(amount) < 1 || sending || cooldown > 0}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-white transition-all hover:from-emerald-400 hover:to-teal-400 active:scale-95 disabled:opacity-30 shadow-lg shadow-emerald-500/20"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
          <span>{amount ? `${amount} COIN` : 'Drop'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Claim Toast ──────────────────────────────────────────

function ClaimToast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-2xl animate-in slide-in-from-top-4 duration-300 ${
      type === 'success'
        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/30'
        : 'bg-[var(--color-danger)] text-white shadow-red-500/30'
    }`}>
      {type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
      {message}
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────

function ChatTab() {
  const { t } = useTranslation();
  const { isConnected, address: currentAddress } = useWalletContext();
  const { messages, loading, sendMessage, sendCoinDrop, claimCoinDrop, messagesEndRef } = useChat(true);
  const prices = useChatPrices();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [linkError, setLinkError] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [style, setStyle] = useState<ChatStyle>(null);
  const [effect, setEffect] = useState<ChatEffect>(null);
  const [activeEffect, setActiveEffect] = useState<ChatEffect>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.style === 'pinned').slice(-3),
    [messages],
  );

  const totalCost = useMemo(() => {
    if (!prices) return 0;
    let cost = 0;
    if (style === 'highlighted') cost += prices.highlighted;
    if (style === 'pinned') cost += prices.pinned;
    if (effect) cost += prices.effect;
    return cost;
  }, [prices, style, effect]);

  const prevLoadingRef = useRef(true);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const justLoaded = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;
    // Always scroll to bottom on initial load; only auto-scroll if near bottom for new messages
    if (justLoaded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    } else {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages.length, loading, messagesEndRef]);

  const startCooldown = useCallback((ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || sending || cooldown > 0 || !isConnected) return;
    if (containsLinks(msg)) {
      setLinkError(true);
      setTimeout(() => setLinkError(false), 2000);
      return;
    }
    setSending(true);
    setInput('');
    try {
      const result = await sendMessage(msg, style, effect);
      if (result.error === 'INSUFFICIENT_BALANCE') {
        setBalanceError(true);
        setInput(msg);
        setTimeout(() => setBalanceError(false), 3000);
        setSending(false);
        return;
      }
      if (result.waitMs) {
        startCooldown(result.waitMs);
      } else {
        startCooldown(3000);
      }
      setStyle(null);
      setEffect(null);
      setShowPremium(false);
    } catch {
      setInput(msg);
    } finally {
      setSending(false);
    }
  }, [input, sending, cooldown, isConnected, sendMessage, startCooldown, style, effect]);

  const handleCoinDrop = useCallback(async (amount: number, message?: string) => {
    setSending(true);
    try {
      const result = await sendCoinDrop(amount, message);
      if (result.error === 'INSUFFICIENT_BALANCE') {
        setBalanceError(true);
        setTimeout(() => setBalanceError(false), 3000);
        setSending(false);
        return;
      }
      if (result.waitMs) {
        startCooldown(result.waitMs);
      } else {
        startCooldown(3000);
      }
      setShowDrop(false);
      setShowPremium(false);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }, [sendCoinDrop, startCooldown]);

  const handleClaim = useCallback(async (messageId: string) => {
    if (claimingId) return;
    setClaimingId(messageId);
    try {
      const result = await claimCoinDrop(messageId);
      if (result.success) {
        setToast({ message: `+${formatLaunch(result.amount!)} COIN!`, type: 'success' });
      } else {
        setToast({ message: t('social.dropAlreadyClaimed'), type: 'error' });
      }
    } catch {
      setToast({ message: t('social.dropClaimFailed'), type: 'error' });
    } finally {
      setClaimingId(null);
    }
  }, [claimCoinDrop, claimingId, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleEffect = useCallback((eff: ChatEffect) => {
    setActiveEffect(eff);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {toast && (
        <ClaimToast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
      {activeEffect && (
        <EffectOverlay effect={activeEffect} onDone={() => setActiveEffect(null)} />
      )}
      {pinnedMessages.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent px-3 py-2 space-y-1">
          {pinnedMessages.map((msg) => (
            <div key={msg.id} className="flex items-center gap-2 text-[10px]">
              <Pin size={9} className="text-amber-400 shrink-0 rotate-45" />
              <UserAvatar address={msg.address} size={16} />
              <Link href={`/game/profile/${msg.address}`} className="font-semibold text-amber-300 hover:underline shrink-0">
                {msg.nickname || shortAddr(msg.address)}
              </Link>
              <span className="text-amber-200/60 truncate flex-1">{msg.message}</span>
            </div>
          ))}
        </div>
      )}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-3 min-h-0">
        <div className="text-center py-2">
          <span className="text-[9px] text-[var(--color-text-secondary)] bg-[var(--color-bg)] rounded-full px-2.5 py-0.5">
            {t('social.chatDailyReset')}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--color-text-secondary)]" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-[var(--color-text-secondary)] py-12">{t('social.chatEmpty')}</p>
        ) : (
          <div className="space-y-1.5">
            {messages.map((msg) =>
              msg.style === 'coin_drop' ? (
                <CoinDropBubble key={msg.id} msg={msg} onClaim={handleClaim} claiming={claimingId} currentAddress={currentAddress ?? null} />
              ) : (
                <ChatBubble key={msg.id} msg={msg} onEffect={handleEffect} />
              ),
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="shrink-0 border-t border-[var(--color-border)] px-3 py-2">
        {!isConnected ? (
          <p className="text-center text-xs text-[var(--color-text-secondary)] py-1">{t('errors.unauthorized')}</p>
        ) : (
          <div>
            {linkError && <p className="text-[10px] text-red-400 mb-1">{t('social.noLinks')}</p>}
            {balanceError && <p className="text-[10px] text-red-400 mb-1">{t('social.insufficientBalance')}</p>}
            {showPremium && (
              <PremiumSelector
                style={style}
                setStyle={setStyle}
                effect={effect}
                setEffect={setEffect}
                prices={prices}
                showDrop={showDrop}
                setShowDrop={setShowDrop}
                t={t}
              />
            )}
            {showPremium && showDrop && (
              <CoinDropInput onSend={handleCoinDrop} sending={sending} cooldown={cooldown} />
            )}
            {!(showPremium && showDrop) && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setShowPremium(!showPremium); setShowDrop(false); }}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                    showPremium || style || effect
                      ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-500/25'
                      : 'text-[var(--color-text-secondary)] hover:text-amber-400 hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <Sparkles size={16} />
                </button>
                <input
                  type="text"
                  value={cooldown > 0 ? '' : input}
                  onChange={(e) => { setInput(e.target.value); setLinkError(false); setBalanceError(false); }}
                  onKeyDown={handleKeyDown}
                  disabled={cooldown > 0 || sending}
                  placeholder={cooldown > 0 ? t('social.chatCooldown', { seconds: cooldown }) : t('social.chatPlaceholder')}
                  className={`flex-1 rounded-xl border bg-[var(--color-bg)] py-2 px-3 text-xs placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50 ${
                    linkError || balanceError ? 'border-red-400' : 'border-[var(--color-border)]'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || cooldown > 0 || sending}
                  className={`flex h-9 shrink-0 items-center justify-center rounded-xl text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 ${
                    totalCost > 0
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-600 gap-1.5 px-3 shadow-lg shadow-amber-500/20'
                      : 'bg-[var(--color-primary)] w-9'
                  }`}
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : totalCost > 0 ? (
                    <>
                      <Send size={14} />
                      <span className="text-[10px] font-bold">{formatLaunch(totalCost)}</span>
                    </>
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Sheet ───────────────────────────────────────────

export function SocialSheet({ open, onClose }: SocialSheetProps) {
  const { t } = useTranslation();
  const [mainTab, setMainTab] = useState<MainTab>('users');
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Transfer modal state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState<SocialUser | null>(null);
  const [transferCurrency, setTransferCurrency] = useState<'coin' | 'axm'>('coin');

  const handleTransfer = useCallback((user: SocialUser, currency: 'coin' | 'axm') => {
    setTransferRecipient(user);
    setTransferCurrency(currency);
    setTransferOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      document.body.style.overflow = '';
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    history.pushState({ socialSheet: true }, '');
    const handlePopState = () => onCloseRef.current();
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onCloseRef.current();
  }, []);

  if (!mounted || !open) return null;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'users', label: t('social.users') },
    { key: 'chat', label: t('social.chat') },
  ];

  return createPortal(
    <>
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        onClick={handleOverlayClick}
        className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col transition-all duration-300 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{ height: '75vh', maxHeight: '75vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] shrink-0">
            <div className="flex gap-1">
              {mainTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMainTab(key)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                    mainTab === key
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {mainTab === 'users' ? (
              <UsersTab onNavigate={() => onCloseRef.current()} onTransfer={handleTransfer} />
            ) : (
              <ChatTab />
            )}
          </div>
        </div>
      </div>

      {/* Transfer Modal — rendered in portal alongside sheet */}
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        initialRecipient={transferRecipient}
        initialCurrency={transferCurrency}
      />
    </>,
    document.body,
  );
}
