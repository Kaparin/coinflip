'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import { API_URL } from '@/lib/constants';
import type { WsEvent } from '@coinflip/shared/types';

interface CommentaryItem {
  betId: string;
  textRu: string;
  textEn: string;
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

export function AiTicker() {
  const { locale } = useTranslation();
  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch initial commentary on mount
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/social/ai-commentary?limit=10`, {
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
      const data = event.data as { betId?: string; textRu?: string; textEn?: string };
      if (!data.textRu || !data.textEn) return;
      setItems(prev => {
        const next = [...prev, { betId: String(data.betId ?? ''), textRu: data.textRu!, textEn: data.textEn! }];
        // Keep last 20 items
        return next.slice(-20);
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
      }, 500); // fade-out duration
    }, 6000); // show each item for 6s

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[currentIndex % items.length];
  if (!current) return null;

  const text = locale === 'ru' ? current.textRu : current.textEn;

  return (
    <div className="ai-ticker">
      <div className="ai-ticker-inner">
        <span className="ai-ticker-icon">&#x1F3B0;</span>
        <span
          className={`ai-ticker-text ${isAnimating ? 'ai-ticker-fade-out' : 'ai-ticker-fade-in'}`}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
