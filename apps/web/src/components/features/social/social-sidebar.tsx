'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Search, Send, Loader2, Sparkles, Pin, Gift, CheckCircle, XCircle, Heart, User, ArrowRightLeft } from 'lucide-react';
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
  useOnlineCount,
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

// ─── User Action Menu ─────────────────────────────────────

function UserActionMenu({
  user,
  anchorRef,
  onClose,
  onTransfer,
  t,
}: {
  user: SocialUser;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onTransfer: (currency: 'coin' | 'axm') => void;
  t: (k: string) => string;
}) {
  const { isConnected, address } = useWalletContext();
  const { isFavorite, toggle: toggleFav, loading: favLoading } = useFavoriteStatus(
    isConnected ? user.address : undefined,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const isSelf = address === user.address;
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

  // Calculate fixed position from anchor element — useLayoutEffect for sync before paint
  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const menuWidth = 192; // w-48 = 12rem = 192px
      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;
      // Flip upward if menu would go below viewport
      if (top + 220 > window.innerHeight) top = rect.top - 220;
      if (left < 8) left = 8;
      setPos({ top, left });
    };
    update();
    // Close on scroll (sidebar scroll moves the card away from menu)
    const scrollParent = anchorRef.current.closest('[class*="overflow-y"]');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', onClose, { passive: true });
      return () => scrollParent.removeEventListener('scroll', onClose);
    }
  }, [anchorRef, onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[60] w-48 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {/* Send COIN */}
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

      {/* Send AXM */}
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

      {/* Favorite */}
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

      {/* View Profile */}
      <Link
        href={`/game/profile/${user.address}`}
        onClick={onClose}
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
  menuOpen,
  onToggleMenu,
}: {
  user: SocialUser;
  t: (k: string, v?: Record<string, string | number>) => string;
  onTransfer: (user: SocialUser, currency: 'coin' | 'axm') => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={cardRef} className="relative">
      <button
        type="button"
        onClick={onToggleMenu}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-surface-hover)] text-left"
      >
        <div className="relative shrink-0">
          <UserAvatar address={user.address} size={30} />
          {user.is_online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-success)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`text-xs font-semibold truncate ${getVipNameClass(user.vip_tier, user.vip_customization?.nameGradient)}`}>
              {user.nickname || shortAddr(user.address)}
            </span>
            <VipBadge tier={user.vip_tier} badgeIcon={user.vip_customization?.badgeIcon} />
          </div>
          <span className="text-[9px] text-[var(--color-text-secondary)]">
            {t('social.totalBets', { count: user.total_bets })}
          </span>
        </div>
      </button>

      {menuOpen && (
        <UserActionMenu
          user={user}
          anchorRef={cardRef}
          onClose={onToggleMenu}
          onTransfer={(currency) => onTransfer(user, currency)}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Users Panel ──────────────────────────────────────────

function UsersPanel({ onTransfer }: { onTransfer: (user: SocialUser, currency: 'coin' | 'axm') => void }) {
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
      <div className="flex gap-1 px-2 pt-1 pb-1.5 shrink-0">
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors ${
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
        <div className="px-2 pb-1.5 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('social.searchPlaceholder')}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-7 pr-2 text-[10px] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain px-1 min-h-0">
        {currentLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-[var(--color-text-secondary)]" />
          </div>
        ) : currentUsers.length === 0 ? (
          <p className="text-center text-[10px] text-[var(--color-text-secondary)] py-8">{emptyMessage}</p>
        ) : (
          <>
            {currentUsers.map((user) => (
              <UserCard
                key={user.address}
                user={user}
                t={t}
                onTransfer={onTransfer}
                menuOpen={openMenuAddr === user.address}
                onToggleMenu={() => setOpenMenuAddr(openMenuAddr === user.address ? null : user.address)}
              />
            ))}
            {subTab === 'all' && nextCursor && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-1.5 text-[10px] text-[var(--color-primary)] font-semibold hover:underline disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={12} className="animate-spin mx-auto" /> : t('social.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Coin Drop Bubble ─────────────────────────────────────

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
    <div className={`relative rounded-xl border p-2.5 transition-all ${
      isClaimed
        ? 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60'
        : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Link href={`/game/profile/${msg.address}`} className="shrink-0">
          <UserAvatar address={msg.address} size={20} />
        </Link>
        <Link href={`/game/profile/${msg.address}`} className={`text-[10px] font-semibold hover:underline ${getVipNameClass(msg.vipTier, null)}`}>
          {msg.nickname || shortAddr(msg.address)}
        </Link>
        <span className="text-[8px] text-[var(--color-text-secondary)] ml-auto">{formatTime(msg.createdAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className={`relative shrink-0 ${isClaimed ? 'grayscale' : ''}`}>
          <Image src="/coin-token-logo.png" alt="COIN" width={36} height={36}
            className="rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-black text-amber-400">{formatLaunch(drop.amount)} <LaunchTokenIcon size={14} className="shrink-0" /></div>
          {isClaimed && (
            <p className="text-[9px] text-[var(--color-text-secondary)]">{drop.claimedByNickname || shortAddr(drop.claimedBy!)}</p>
          )}
        </div>
        {isClaimed ? (
          <CheckCircle size={12} className="text-[var(--color-text-secondary)] shrink-0" />
        ) : canClaim ? (
          <button type="button" onClick={() => onClaim(msg.id)} disabled={isClaiming}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-black transition-colors hover:bg-amber-400 active:scale-95 disabled:opacity-50">
            {isClaiming ? <Loader2 size={12} className="animate-spin" /> : 'Grab!'}
          </button>
        ) : isMine ? (
          <Gift size={14} className="text-amber-400/50 shrink-0" />
        ) : null}
      </div>
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────

function ChatBubble({ msg, locale }: { msg: ChatMessage; locale?: string }) {
  const isHighlighted = msg.style === 'highlighted';
  const isPinned = msg.style === 'pinned';
  const isAiBot = msg.style === 'ai_bot' || msg.address === 'system_oracle';

  const wrapperClass = isAiBot
    ? 'relative flex items-start gap-1.5 py-1.5 px-2 chat-bubble-ai'
    : isPinned
      ? 'relative flex items-start gap-1.5 py-2 px-2 rounded-lg bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border border-amber-500/25'
      : isHighlighted
        ? 'relative flex items-start gap-1.5 py-1 px-2 rounded-md bg-gradient-to-r from-amber-500/8 to-transparent border-l-2 border-amber-400/40'
        : 'relative flex items-start gap-1.5 py-0.5';

  // For AI bot messages: show localized text
  let displayMessage = msg.message;
  if (isAiBot) {
    if (msg.textRu && msg.textEn) {
      displayMessage = locale === 'ru' ? msg.textRu : msg.textEn;
    } else if (msg.message.includes('\n---\n')) {
      const [ru, en] = msg.message.split('\n---\n');
      displayMessage = locale === 'ru' ? (ru ?? msg.message) : (en ?? msg.message);
    }
  }

  return (
    <div className={wrapperClass}>
      {isPinned && (
        <div className="absolute -top-1.5 left-2 flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-1.5 py-px">
          <Pin size={6} className="text-black" />
          <span className="text-[6px] font-black tracking-wider text-black uppercase">SUPER CHAT</span>
        </div>
      )}
      {isAiBot ? (
        msg.avatarUrl ? (
          <img src={msg.avatarUrl} alt="" className="shrink-0 mt-0.5 h-5 w-5 rounded-full object-cover" />
        ) : (
          <div className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px]">
            &#x2728;
          </div>
        )
      ) : (
        <Link href={`/game/profile/${msg.address}`} className="shrink-0 mt-0.5">
          <UserAvatar address={msg.address} size={20} />
        </Link>
      )}
      <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
        {isAiBot ? (
          <>
            <span className="font-semibold" style={msg.nameColor ? { color: msg.nameColor } : undefined}>
              {msg.nickname || 'Oracle'}
            </span>
            {' '}<span className="chat-ai-badge">AI</span>
          </>
        ) : (
          <>
            <Link href={`/game/profile/${msg.address}`}
              className={`font-semibold hover:underline ${isPinned ? 'text-amber-300' : getVipNameClass(msg.vipTier, null)}`}>
              {msg.nickname || shortAddr(msg.address)}
            </Link>
            {msg.vipTier && <>{' '}<VipBadge tier={msg.vipTier} /></>}
          </>
        )}
        <span className="text-[8px] text-[var(--color-text-secondary)] ml-0.5">{formatTime(msg.createdAt)}</span>
        {msg.effect && (
          <span className="ml-0.5 text-[8px]">
            {msg.effect === 'confetti' ? '🎉' : msg.effect === 'coins' ? '🪙' : '🔥'}
          </span>
        )}
        <span className="text-[var(--color-text-secondary)] mx-0.5">&middot;</span>
        <span className={`break-words ${isPinned ? 'font-medium text-amber-100/90' : isAiBot ? 'text-indigo-200/80' : ''}`}>{displayMessage}</span>
      </div>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────

function ChatPanel() {
  const { t, locale } = useTranslation();
  const { isConnected, address: currentAddress } = useWalletContext();
  const { messages, loading, sendMessage, sendCoinDrop, claimCoinDrop, messagesEndRef } = useChat(true);
  const prices = useChatPrices();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [style, setStyle] = useState<ChatStyle>(null);
  const [effect, setEffect] = useState<ChatEffect>(null);
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

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || sending || cooldown > 0 || !isConnected) return;
    if (LINK_RE.test(msg)) return;
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
      startCooldown(result.waitMs || 3000);
      setStyle(null);
      setEffect(null);
      setShowPremium(false);
    } catch { setInput(msg); }
    finally { setSending(false); }
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
      startCooldown(result.waitMs || 3000);
      setShowDrop(false);
      setShowPremium(false);
    } catch { /* ignore */ }
    finally { setSending(false); }
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
    } catch { setToast({ message: t('social.dropClaimFailed'), type: 'error' }); }
    finally { setClaimingId(null); }
  }, [claimCoinDrop, claimingId, t]);

  // Drop amount presets
  const [dropAmount, setDropAmount] = useState('');
  const [dropMsg, setDropMsg] = useState('');
  const dropPresets = [5, 10, 50, 100];

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-1 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold shadow-lg animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-[var(--color-danger)] text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {toast.message}
          {setTimeout(() => setToast(null), 3000) && null}
        </div>
      )}

      {/* Pinned */}
      {pinnedMessages.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent px-2 py-1.5 space-y-0.5">
          {pinnedMessages.map((msg) => (
            <div key={msg.id} className="flex items-center gap-1.5 text-[9px]">
              <Pin size={8} className="text-amber-400 shrink-0 rotate-45" />
              <UserAvatar address={msg.address} size={14} />
              <span className="font-semibold text-amber-300 shrink-0 truncate max-w-[60px]">
                {msg.nickname || shortAddr(msg.address)}
              </span>
              <span className="text-amber-200/60 truncate flex-1">{msg.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-2 min-h-0">
        <div className="text-center py-1.5">
          <span className="text-[8px] text-[var(--color-text-secondary)] bg-[var(--color-bg)] rounded-full px-2 py-0.5">
            {t('social.chatDailyReset')}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-[var(--color-text-secondary)]" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-[10px] text-[var(--color-text-secondary)] py-8">{t('social.chatEmpty')}</p>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) =>
              msg.style === 'coin_drop' ? (
                <CoinDropBubble key={msg.id} msg={msg} onClaim={handleClaim} claiming={claimingId} currentAddress={currentAddress ?? null} />
              ) : (
                <ChatBubble key={msg.id} msg={msg} locale={locale} />
              ),
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--color-border)] px-2 py-1.5">
        {!isConnected ? (
          <p className="text-center text-[10px] text-[var(--color-text-secondary)] py-1">{t('errors.unauthorized')}</p>
        ) : (
          <div>
            {balanceError && <p className="text-[9px] text-red-400 mb-1">{t('social.insufficientBalance')}</p>}

            {showPremium && prices && (
              <div className="space-y-1.5 pb-1.5">
                <div className="flex gap-1">
                  {([
                    { key: 'highlighted' as const, label: t('social.highlighted'), price: prices.highlighted, g: 'from-amber-600 to-yellow-500' },
                    { key: 'pinned' as const, label: t('social.pinned'), price: prices.pinned, g: 'from-orange-600 to-red-500' },
                  ] as const).map(({ key, label, price, g }) => (
                    <button key={key} type="button" onClick={() => { setStyle(style === key ? null : key); setShowDrop(false); }}
                      className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all border ${
                        style === key ? `bg-gradient-to-b ${g} text-white border-transparent` : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-amber-500/30'}`}>
                      <span>{label}</span>
                      <span className="flex items-center justify-center gap-0.5 text-[8px]">{formatLaunch(price)} <LaunchTokenIcon size={10} className="shrink-0" /></span>
                    </button>
                  ))}
                  <button type="button" onClick={() => { setShowDrop(!showDrop); setStyle(null); setEffect(null); }}
                    className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-semibold transition-all border ${
                      showDrop ? 'bg-gradient-to-b from-emerald-500 to-teal-600 text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-emerald-500/30'}`}>
                    <Gift size={12} />
                    <span className="text-[8px]">Drop</span>
                  </button>
                </div>
                {!showDrop && (style === 'highlighted' || style === 'pinned') && (
                  <div className="flex gap-1">
                    {(['confetti', 'coins', 'fire'] as const).map((key) => (
                      <button key={key} type="button" onClick={() => setEffect(effect === key ? null : key)}
                        className={`flex-1 flex items-center justify-center gap-0.5 rounded-lg py-1 text-[9px] font-semibold border ${
                          effect === key ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
                        {key === 'confetti' ? '🎉' : key === 'coins' ? '🪙' : '🔥'}
                        <span className="flex items-center gap-0.5 text-[8px]">+{formatLaunch(prices.effect)} <LaunchTokenIcon size={10} className="shrink-0" /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Drop input */}
            {showPremium && showDrop && (
              <div className="space-y-1.5 pb-1.5">
                <div className="flex gap-1">
                  {dropPresets.map((v) => (
                    <button key={v} type="button" onClick={() => setDropAmount(String(v))}
                      className={`flex-1 rounded-md py-1 text-[10px] font-bold border ${
                        dropAmount === String(v) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
                      {v}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input type="text" value={dropMsg} onChange={(e) => setDropMsg(e.target.value)}
                    placeholder={t('social.dropMessage')} maxLength={200}
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[10px] focus:outline-none focus:border-emerald-500" />
                  <button type="button" disabled={!dropAmount || Number(dropAmount) < 1 || sending || cooldown > 0}
                    onClick={() => { if (Number(dropAmount) >= 1) handleCoinDrop(Number(dropAmount), dropMsg || undefined); }}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-30">
                    {sending ? <Loader2 size={10} className="animate-spin" /> : <Gift size={10} />}
                    <span className="flex items-center gap-0.5">{dropAmount || '0'} {dropAmount && <LaunchTokenIcon size={10} className="shrink-0" />}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Normal input */}
            {!(showPremium && showDrop) && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { setShowPremium(!showPremium); setShowDrop(false); }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                    showPremium || style || effect
                      ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-md'
                      : 'text-[var(--color-text-secondary)] hover:text-amber-400'}`}>
                  <Sparkles size={14} />
                </button>
                <input type="text" value={cooldown > 0 ? '' : input}
                  onChange={(e) => { setInput(e.target.value); setBalanceError(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={cooldown > 0 || sending}
                  placeholder={cooldown > 0 ? `${cooldown}s...` : t('social.chatPlaceholder')}
                  className={`flex-1 rounded-lg border bg-[var(--color-bg)] py-1.5 px-2 text-[11px] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50 ${
                    balanceError ? 'border-red-400' : 'border-[var(--color-border)]'}`} />
                <button type="button" onClick={handleSend} disabled={!input.trim() || cooldown > 0 || sending}
                  className={`flex h-8 shrink-0 items-center justify-center rounded-lg text-white transition-all active:scale-95 disabled:opacity-30 ${
                    totalCost > 0 ? 'bg-gradient-to-r from-amber-500 to-yellow-600 gap-1 px-2.5' : 'bg-[var(--color-primary)] w-8'}`}>
                  {sending ? <Loader2 size={14} className="animate-spin" /> : totalCost > 0 ? (
                    <><Send size={12} /><span className="flex items-center gap-0.5 text-[9px] font-bold">{formatLaunch(totalCost)} <LaunchTokenIcon size={10} className="shrink-0" /></span></>
                  ) : <Send size={14} />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────

export function SocialSidebar() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MainTab>('chat');
  const onlineCount = useOnlineCount();

  // Transfer modal state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState<SocialUser | null>(null);
  const [transferCurrency, setTransferCurrency] = useState<'coin' | 'axm'>('coin');

  const handleTransfer = useCallback((user: SocialUser, currency: 'coin' | 'axm') => {
    setTransferRecipient(user);
    setTransferCurrency(currency);
    setTransferOpen(true);
  }, []);

  const tabs: { key: MainTab; label: string }[] = [
    { key: 'chat', label: t('social.chat') },
    { key: 'users', label: `${t('social.users')}${onlineCount > 0 ? ` (${onlineCount})` : ''}` },
  ];

  return (
    <>
      <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] min-h-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 px-2 py-2 border-b border-[var(--color-border)] shrink-0">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === key
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {tab === 'users' ? <UsersPanel onTransfer={handleTransfer} /> : <ChatPanel />}
        </div>
      </aside>

      {/* Transfer Modal */}
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        initialRecipient={transferRecipient}
        initialCurrency={transferCurrency}
      />
    </>
  );
}
