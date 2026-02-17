'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** Only enable on mobile. Default true. */
  mobileOnly?: boolean;
}

export function PullToRefresh({ onRefresh, children, mobileOnly = true }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  pullDistanceRef.current = pullDistance;

  useEffect(() => {
    if (mobileOnly && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const scrollTop = window.scrollY ?? document.documentElement.scrollTop;
      if (scrollTop <= 5) {
        pullingRef.current = true;
        startYRef.current = touch.clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (!pullingRef.current || refreshing) return;
      const scrollTop = window.scrollY ?? document.documentElement.scrollTop;
      if (scrollTop > 5) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }
      const delta = touch.clientY - startYRef.current;
      if (delta > 0) setPullDistance(Math.min(delta, MAX_PULL));
    };

    const handleTouchEnd = async () => {
      const dist = pullDistanceRef.current;
      pullingRef.current = false;
      if (dist >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPullDistance(0);
        try {
          await onRefreshRef.current();
        } finally {
          setRefreshing(false);
        }
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [mobileOnly, refreshing]);

  const showIndicator = pullDistance > 0 || refreshing;
  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <>
      {showIndicator && (
        <div
          className="fixed left-0 right-0 top-0 z-40 flex justify-center pt-4 pb-2 pointer-events-none md:hidden"
          style={{ opacity: progress || (refreshing ? 1 : 0) }}
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg transition-transform ${
              refreshing ? 'scale-100' : 'scale-75'
            }`}
          >
            {refreshing ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
            ) : (
              <svg
                className="w-5 h-5 text-[var(--color-primary)] transition-transform"
                style={{ transform: `rotate(${progress * 180}deg)` }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  );
}
