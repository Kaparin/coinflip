'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { WsEvent } from '@coinflip/shared/types';

export interface PendingBet {
  txHash: string;
  amount: string;
  maker: string;
  createdAt: number;
  status: 'confirming' | 'failed';
  failReason?: string;
}

const STORAGE_KEY = 'coinflip_pending_bets';
const MAX_AGE_MS = 120 * 1000; // 120 seconds — must exceed pending deduction TTL (90s) so UI stays consistent

/** Load pending bets from sessionStorage */
function loadPending(): PendingBet[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as PendingBet[];
    // Expire old entries
    const now = Date.now();
    return items.filter(b => now - b.createdAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

/** Persist pending bets to sessionStorage */
function savePending(bets: PendingBet[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  } catch { /* ignore */ }
}

/**
 * Manages bets that have been submitted to the chain but not yet confirmed.
 * These bets are stored in sessionStorage and displayed with a "Confirming..." UI.
 * When a WebSocket `bet_confirmed` event arrives, the pending bet is removed.
 */
export function usePendingBets() {
  const [pendingBets, setPendingBets] = useState<PendingBet[]>(() => loadPending());
  const pendingRef = useRef(pendingBets);
  pendingRef.current = pendingBets;

  // Sync to sessionStorage on change
  useEffect(() => {
    savePending(pendingBets);
  }, [pendingBets]);

  /** Add a new pending bet (called after successful create API response) */
  const addPending = useCallback((bet: Omit<PendingBet, 'createdAt' | 'status'>) => {
    setPendingBets(prev => {
      const next = [...prev, { ...bet, createdAt: Date.now(), status: 'confirming' as const }];
      return next;
    });
  }, []);

  /** Remove a pending bet by txHash (called when WS confirms or if bet appears in DB) */
  const removePending = useCallback((txHash: string) => {
    setPendingBets(prev => prev.filter(b => b.txHash !== txHash));
  }, []);

  /** Mark a pending bet as failed */
  const markFailed = useCallback((txHash: string, reason: string) => {
    setPendingBets(prev =>
      prev.map(b =>
        b.txHash === txHash ? { ...b, status: 'failed' as const, failReason: reason } : b,
      ),
    );
    // Auto-remove failed bets after 5 seconds
    setTimeout(() => {
      setPendingBets(prev => prev.filter(b => b.txHash !== txHash));
    }, 5000);
  }, []);

  /** Handle WS events — remove confirmed bets, mark failed ones */
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === 'bet_confirmed') {
      const txHash = (event.data as any)?.txhash_create;
      if (txHash) {
        removePending(txHash);
      } else {
        // If we can't match by txHash, remove all confirming bets
        // (the new bet will appear in the normal list via React Query invalidation)
        setPendingBets(prev => prev.filter(b => b.status !== 'confirming'));
      }
    }

    if (event.type === 'bet_create_failed') {
      const txHash = (event.data as any)?.txHash;
      const reason = (event.data as any)?.reason ?? 'Transaction failed';
      if (txHash) {
        markFailed(txHash, reason);
      }
    }
  }, [removePending, markFailed]);

  // Clean up expired pending bets periodically — mark stale bets as failed
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPendingBets(prev => {
        let changed = false;
        const updated = prev.reduce<PendingBet[]>((acc, b) => {
          if (now - b.createdAt >= MAX_AGE_MS) {
            if (b.status === 'confirming') {
              // Mark as failed instead of silently removing
              acc.push({ ...b, status: 'failed', failReason: 'Confirmation timed out. The bet may still appear shortly.' });
              changed = true;
            }
            // Already-failed bets older than MAX_AGE + 10s are removed
            else if (now - b.createdAt >= MAX_AGE_MS + 10_000) {
              changed = true; // drop it
            } else {
              acc.push(b);
            }
          } else {
            acc.push(b);
          }
          return acc;
        }, []);
        return changed ? updated : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return {
    pendingBets: pendingBets.filter(b => b.status === 'confirming'),
    failedBets: pendingBets.filter(b => b.status === 'failed'),
    addPending,
    removePending,
    handleWsEvent,
  };
}
