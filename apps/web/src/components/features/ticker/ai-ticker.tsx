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
                  className="flex items-start gap-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)] shrink-0 pt-0.5 min-w-[50px]">
                    <Clock size={10} />
                    <span className="tabular-nums">{formatTime(item.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text)] leading-relaxed">{text}</p>
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch initial commentary on mount
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/social/ai-commentary?limit=50`, {
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json() as { data: CommentaryItem[] };
          if (json.data?.length > 0) {
            setItems(json.data.reverse()); // oldest first
          }
        }
      } catch {
        // Silently fail — ticker is non-critical
      }
    };
    fetchInitial();
  }, []);

  // Subscribe to new commentary via WS
  useEffect(() => {
    return subscribeToTickerEvents((event) => {
      if (event.type !== 'ai_commentary') return;
      const data = event.data as { betId?: string; textRu?: string; textEn?: string; createdAt?: string };
      if (!data.textRu || !data.textEn) return;
      setItems(prev => {
        const next = [...prev, {
          betId: String(data.betId ?? ''),
          textRu: data.textRu!,
          textEn: data.textEn!,
          createdAt: data.createdAt ?? new Date().toISOString(),
        }];
        return next.slice(-50);
      });
    });
  }, []);

  // Rotate through items
  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % items.length);
        setIsAnimating(false);
      }, 500);
    }, 6000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[currentIndex % items.length];
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
          <span className="ai-ticker-icon">&#x1F3B0;</span>
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
