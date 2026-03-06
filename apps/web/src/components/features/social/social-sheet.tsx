'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { useWalletContext } from '@/contexts/wallet-context';
import { UserAvatar } from '@/components/ui';
import { VipBadge } from '@/components/ui/vip-badge';
import { getVipNameClass } from '@/components/ui/vip-avatar-frame';
import {
  useOnlineUsers,
  useFavorites,
  useAllUsers,
  useChat,
  type SocialUser,
  type ChatMessage,
} from '@/hooks/use-social';

// ─── Types ────────────────────────────────────────────────

type MainTab = 'users' | 'chat';
type UsersSubTab = 'online' | 'favorites' | 'all';

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

// ─── User Card ────────────────────────────────────────────

function UserCard({ user, t, onNavigate }: { user: SocialUser; t: (k: string, v?: Record<string, string | number>) => string; onNavigate: () => void }) {
  return (
    <Link
      href={`/game/profile/${user.address}`}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.99]"
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
    </Link>
  );
}

// ─── Users Tab ────────────────────────────────────────────

function UsersTab({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const [subTab, setSubTab] = useState<UsersSubTab>('online');
  const [search, setSearch] = useState('');

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
      {/* Sub-tabs */}
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

      {/* Search (only for "All" tab) */}
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

      {/* User list */}
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
              <UserCard key={user.address} user={user} t={t} onNavigate={onNavigate} />
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

// ─── Chat Tab ─────────────────────────────────────────────

function ChatTab() {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const { messages, loading, sendMessage, messagesEndRef } = useChat(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 100px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, messagesEndRef]);

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
    setSending(true);
    setInput('');
    try {
      const result = await sendMessage(msg);
      if (result.waitMs) {
        startCooldown(result.waitMs);
      } else {
        startCooldown(3000);
      }
    } catch {
      setInput(msg); // restore on error
    } finally {
      setSending(false);
    }
  }, [input, sending, cooldown, isConnected, sendMessage, startCooldown]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-3 min-h-0">
        {/* Daily reset notice */}
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
          <div className="space-y-1">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-[var(--color-border)] px-3 py-2">
        {!isConnected ? (
          <p className="text-center text-xs text-[var(--color-text-secondary)] py-1">{t('errors.unauthorized')}</p>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cooldown > 0 ? '' : input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={cooldown > 0 || sending}
              placeholder={cooldown > 0 ? t('social.chatCooldown', { seconds: cooldown }) : t('social.chatPlaceholder')}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2 px-3 text-xs placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || cooldown > 0 || sending}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Link href={`/game/profile/${msg.address}`} className="shrink-0 mt-0.5">
        <UserAvatar address={msg.address} size={24} />
      </Link>
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <Link
          href={`/game/profile/${msg.address}`}
          className={`font-semibold hover:underline ${getVipNameClass(msg.vipTier, null)}`}
        >
          {msg.nickname || shortAddr(msg.address)}
        </Link>
        {msg.vipTier && <>{' '}<VipBadge tier={msg.vipTier} /></>}
        <span className="text-[9px] text-[var(--color-text-secondary)] ml-1">{formatTime(msg.createdAt)}</span>
        <span className="text-[var(--color-text-secondary)] mx-1">·</span>
        <span className="break-words">{msg.message}</span>
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Animate in/out
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

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Android back button
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
        style={{ height: '70vh', maxHeight: '70vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] shrink-0">
          {/* Main tabs */}
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
            <UsersTab onNavigate={() => onCloseRef.current()} />
          ) : (
            <ChatTab />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
