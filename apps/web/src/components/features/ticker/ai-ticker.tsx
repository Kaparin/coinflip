'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Clock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { API_URL } from '@/lib/constants';
import type { WsEvent } from '@coinflip/shared/types';

interface CommentaryItem {
  betId: string;
  textRu: string;
  textEn: string;
  createdAt: string;
}

/** Subscribe to WS events via the global onEvent callback pattern */
const subscribers = new Set<(event: WsEvent) => void>();

export function subscribeToTickerEvents(cb: (event: WsEvent) => void) {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

export function emitTickerEvent(event: WsEvent) {
  for (const cb of subscribers) cb(event);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── History Sheet ─────────────────────────────────────

function HistorySheet({ items, locale, onClose }: { items: CommentaryItem[]; locale: string; onClose: () => void }) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = '';
    };
  }, []);

  // Scroll to bottom on open (newest at bottom)
  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible, items.length]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  // Sort: oldest first (newest at bottom)
  const sorted = [...items].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet — slides from top */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 left-0 right-0 max-h-[70vh] flex flex-col bg-[var(--color-bg)] border-b border-[var(--color-border)] shadow-2xl transition-transform duration-200 ${visible ? 'translate-y-0' : '-translate-y-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold">{t('ticker.historyTitle')}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">{t('ticker.noHistory')}</p>
          ) : (
            sorted.map((item, i) => {
              const text = locale === 'ru' ? item.textRu : item.textEn;
              return (
                <div
                  key={`${item.betId}-${i}`}
                  className="flex flex-col items-center gap-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]">
                    <Clock size={10} />
                    <span className="tabular-nums">{formatTime(item.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text)] leading-relaxed text-center">{text}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main Ticker ───────────────────────────────────────

export function AiTicker() {
  const { locale, t } = useTranslation();
  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Track how many new (unseen) items remain to show
  const newItemsToShowRef = useRef(0);

  // Fetch initial commentary on mount — start collapsed (all items are "old")
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/social/ai-commentary?limit=50`, {
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json() as { data: CommentaryItem[] };
          if (json.data?.length > 0) {
            const reversed = json.data.reverse(); // oldest first
            setItems(reversed);
            setDisplayIndex(reversed.length - 1);
            // All fetched items are already "seen" — start collapsed
            newItemsToShowRef.current = 0;
            setCollapsed(true);
          }
        }
      } catch {
        // Silently fail — ticker is non-critical
      }
    };
    fetchInitial();
  }, []);

  // Subscribe to new commentary via WS — only show genuinely new items
  useEffect(() => {
    return subscribeToTickerEvents((event) => {
      if (event.type !== 'ai_commentary') return;
      const data = event.data as { betId?: string; textRu?: string; textEn?: string; createdAt?: string };
      if (!data.textRu || !data.textEn) return;

      const newBetId = String(data.betId ?? '');

      setItems(prev => {
        if (newBetId && prev.some(item => item.betId === newBetId)) return prev;
        const next = [...prev, {
          betId: newBetId,
          textRu: data.textRu!,
          textEn: data.textEn!,
          createdAt: data.createdAt ?? new Date().toISOString(),
        }];
        return next.slice(-50);
      });

      // Queue this as a new item to display
      newItemsToShowRef.current++;
      setCollapsed(false);
    });
  }, []);

  // When new items arrive via WS, jump to the latest
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (items.length > prevLenRef.current && prevLenRef.current > 0) {
      setDisplayIndex(items.length - 1);
      setCollapsed(false);
    }
    prevLenRef.current = items.length;
  }, [items.length]);

  // Show only new items sequentially, then collapse
  useEffect(() => {
    if (collapsed || items.length === 0) return;

    timerRef.current = setTimeout(() => {
      newItemsToShowRef.current--;

      if (newItemsToShowRef.current <= 0) {
        // All new items shown — fade out and collapse
        newItemsToShowRef.current = 0;
        setIsAnimating(true);
        setTimeout(() => {
          setCollapsed(true);
          setIsAnimating(false);
        }, 500);
        return;
      }

      // Show next new (older unseen) item
      setIsAnimating(true);
      setTimeout(() => {
        setDisplayIndex(prev => {
          const next = prev - 1;
          return next >= 0 ? next : prev;
        });
        setIsAnimating(false);
      }, 500);
    }, 6000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [collapsed, items.length, displayIndex]);

  if (items.length === 0) return null;

  // Collapsed — show just a small clickable indicator
  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="ai-ticker-collapsed group"
          title={t('ticker.historyTitle')}
        >
          <Sparkles size={14} className="text-indigo-400 group-hover:text-indigo-300 transition-colors" />
        </button>

        {showHistory && (
          <HistorySheet
            items={items}
            locale={locale}
            onClose={() => setShowHistory(false)}
          />
        )}
      </>
    );
  }

  const current = items[displayIndex % items.length];
  if (!current) return null;

  const text = locale === 'ru' ? current.textRu : current.textEn;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowHistory(true)}
        className="ai-ticker group"
      >
        <div className="ai-ticker-inner">
          <Sparkles size={14} className="text-indigo-400 shrink-0" />
          <span
            className={`ai-ticker-text ${isAnimating ? 'ai-ticker-fade-out' : 'ai-ticker-fade-in'}`}
          >
            {text}
          </span>
        </div>
      </button>

      {showHistory && (
        <HistorySheet
          items={items}
          locale={locale}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}
