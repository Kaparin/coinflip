'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Clock, ChevronDown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { API_URL } from '@/lib/constants';
import type { WsEvent } from '@coinflip/shared/types';

interface CommentaryItem {
  betId: string;
  textRu: string;
  textEn: string;
  createdAt: string;
  personaName?: string;
  personaAvatar?: string;
  personaColor?: string;
}

/* ─── WS pub/sub ─── */
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
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ═══════════════════════════════════════════════════════
   History Sheet — full-screen overlay with scrollable list
   ═══════════════════════════════════════════════════════ */

function HistorySheet({ items, locale, onClose }: {
  items: CommentaryItem[];
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Scroll to bottom after open
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [close]);

  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return createPortal(
    <div className="fixed inset-0 z-[70]" onClick={close}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          opacity: open ? 1 : 0,
          transition: 'opacity 250ms ease',
        }}
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '70dvh',
          transform: open ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          borderRadius: '0 0 16px 16px',
          overflow: 'hidden',
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              {t('ticker.historyTitle')}
            </h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              ({sorted.length})
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable list — grid row takes remaining space */}
        <div
          ref={listRef}
          style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
          className="px-4 py-3 space-y-2"
        >
          {sorted.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">
              {t('ticker.noHistory')}
            </p>
          ) : (
            sorted.map((item, i) => {
              const text = locale === 'ru' ? item.textRu : item.textEn;
              return (
                <div
                  key={`${item.betId}-${i}`}
                  className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3"
                >
                  {/* Persona row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {item.personaAvatar ? (
                        <img
                          src={item.personaAvatar}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                          <Sparkles size={11} className="text-white" />
                        </div>
                      )}
                      <span
                        className="text-xs font-bold"
                        style={item.personaColor ? { color: item.personaColor } : undefined}
                      >
                        {item.personaName || 'Oracle'}
                      </span>
                      <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-indigo-400">
                        AI
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]">
                      <Clock size={10} />
                      <span className="tabular-nums">{formatTime(item.createdAt)}</span>
                    </div>
                  </div>
                  {/* Text */}
                  <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
                    {text}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Drag hint */}
      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/40 pointer-events-none"
          style={{ top: 'calc(70dvh + 12px)' }}
        >
          <ChevronDown size={20} />
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════
   Main Ticker Bar
   ═══════════════════════════════════════════════════════ */

export function AiTicker() {
  const { locale, t } = useTranslation();
  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const newItemsToShowRef = useRef(0);

  // Fetch initial
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/social/ai-commentary?limit=50`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json() as { data: CommentaryItem[] };
        if (json.data?.length > 0) {
          const reversed = json.data.reverse();
          setItems(reversed);
          setDisplayIndex(reversed.length - 1);
          newItemsToShowRef.current = 0;
          setCollapsed(true);
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  // WS subscription
  useEffect(() => {
    return subscribeToTickerEvents((event) => {
      if (event.type !== 'ai_commentary') return;
      const d = event.data as Record<string, string | undefined>;
      if (!d.textRu || !d.textEn) return;
      const newBetId = String(d.betId ?? '');

      setItems(prev => {
        if (newBetId && prev.some(item => item.betId === newBetId)) return prev;
        return [...prev, {
          betId: newBetId,
          textRu: d.textRu!,
          textEn: d.textEn!,
          createdAt: d.createdAt ?? new Date().toISOString(),
          personaName: d.personaName ?? undefined,
          personaAvatar: d.personaAvatar ?? undefined,
          personaColor: d.personaColor ?? undefined,
        }].slice(-50);
      });

      newItemsToShowRef.current++;
      setCollapsed(false);
    });
  }, []);

  // Jump to newest on new WS items
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (items.length > prevLenRef.current && prevLenRef.current > 0) {
      setDisplayIndex(items.length - 1);
      setCollapsed(false);
    }
    prevLenRef.current = items.length;
  }, [items.length]);

  // Auto-rotate new items, then collapse
  useEffect(() => {
    if (collapsed || items.length === 0) return;
    timerRef.current = setTimeout(() => {
      newItemsToShowRef.current--;
      if (newItemsToShowRef.current <= 0) {
        newItemsToShowRef.current = 0;
        setIsAnimating(true);
        setTimeout(() => { setCollapsed(true); setIsAnimating(false); }, 500);
        return;
      }
      setIsAnimating(true);
      setTimeout(() => {
        setDisplayIndex(prev => Math.max(prev - 1, 0));
        setIsAnimating(false);
      }, 500);
    }, 6000);
    return () => { clearTimeout(timerRef.current); };
  }, [collapsed, items.length, displayIndex]);

  if (items.length === 0) return null;

  // Collapsed mini-bar
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
          <HistorySheet items={items} locale={locale} onClose={() => setShowHistory(false)} />
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
          {current.personaAvatar ? (
            <img src={current.personaAvatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
          ) : (
            <Sparkles size={14} className="text-indigo-400 shrink-0" />
          )}
          {current.personaName && (
            <span
              className="text-xs font-bold shrink-0"
              style={current.personaColor ? { color: current.personaColor } : undefined}
            >
              {current.personaName}
            </span>
          )}
          <span className={`ai-ticker-text ${isAnimating ? 'ai-ticker-fade-out' : 'ai-ticker-fade-in'}`}>
            {text}
          </span>
        </div>
      </button>
      {showHistory && (
        <HistorySheet items={items} locale={locale} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}
