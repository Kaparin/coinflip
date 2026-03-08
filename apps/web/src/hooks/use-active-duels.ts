'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { WsEvent } from '@coinflip/shared/types';

export type DuelPhase = 'flipping' | 'dueling' | 'resolving' | 'avatar-merge' | 'winner-reveal' | 'fade-out';

export interface DuelMessage {
  id: string;
  address: string;
  nickname?: string;
  message: string;
  created_at: string;
}

export interface ActiveDuel {
  betId: string;
  phase: DuelPhase;
  maker: string;
  makerNickname?: string | null;
  acceptor: string;
  acceptorNickname?: string | null;
  amount: string;
  makerVipTier?: string | null;
  makerVipCustomization?: any;
  acceptorVipTier?: string | null;
  acceptorVipCustomization?: any;
  messages: DuelMessage[];
  winner?: string | null;
  startedAt: number;
}

type Listener = () => void;

/** Singleton store for active duels — survives component re-renders */
let duels = new Map<string, ActiveDuel>();
let listeners = new Set<Listener>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Map<string, ActiveDuel> {
  return duels;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Add or update a duel in the store */
function setDuel(betId: string, duel: ActiveDuel) {
  duels = new Map(duels);
  duels.set(betId, duel);
  emitChange();
}

/** Remove a duel from the store */
function removeDuel(betId: string) {
  if (!duels.has(betId)) return;
  duels = new Map(duels);
  duels.delete(betId);
  emitChange();
}

/** Update a duel's phase */
function updatePhase(betId: string, phase: DuelPhase) {
  const duel = duels.get(betId);
  if (!duel) return;
  setDuel(betId, { ...duel, phase });
}

/** Add a message to a duel */
function addMessage(betId: string, msg: DuelMessage) {
  const duel = duels.get(betId);
  if (!duel) return;
  // Deduplicate by message id
  if (duel.messages.some((m) => m.id === msg.id)) return;
  setDuel(betId, { ...duel, messages: [...duel.messages, msg] });
}

/** Set winner and transition through reveal phases */
function revealWinner(betId: string, winner: string) {
  const duel = duels.get(betId);
  if (!duel) return;
  setDuel(betId, { ...duel, phase: 'winner-reveal', winner });
}

const FADE_OUT_DELAY = 10_000; // 10s after winner reveal
const REMOVE_DELAY = 500; // after fade-out animation
const STALE_DUEL_MAX_AGE = 120_000; // 120s — backend polls up to 60s + 90s deferred check
const STALE_CLEANUP_INTERVAL = 15_000; // check every 15s

/**
 * Hook to access and manage active duels.
 * Listens to WS events to auto-manage duel lifecycle.
 */
export function useActiveDuels() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Process a WS event and update duels accordingly */
  const handleWsEvent = useCallback((event: WsEvent) => {
    const data = event.data as any;

    switch (event.type) {
      case 'bet_accepting': {
        const betId = String(data.id);
        if (duels.has(betId)) return; // already tracked

        setDuel(betId, {
          betId,
          phase: 'flipping',
          maker: data.maker ?? '',
          makerNickname: data.maker_nickname,
          acceptor: data.acceptor ?? '',
          acceptorNickname: data.acceptor_nickname,
          amount: String(data.amount ?? '0'),
          makerVipTier: data.maker_vip_tier,
          makerVipCustomization: data.maker_vip_customization,
          acceptorVipTier: data.acceptor_vip_tier,
          acceptorVipCustomization: data.acceptor_vip_customization,
          messages: [],
          startedAt: Date.now(),
        });

        // Transition to dueling after flip animation
        setTimeout(() => updatePhase(betId, 'dueling'), 900);
        break;
      }

      case 'bet_accepted': {
        const betId = String(data.id);
        const duel = duels.get(betId);
        if (duel && duel.phase === 'flipping') {
          updatePhase(betId, 'dueling');
        }
        // If not tracked, create and skip to dueling
        if (!duel) {
          setDuel(betId, {
            betId,
            phase: 'dueling',
            maker: data.maker ?? '',
            makerNickname: data.maker_nickname,
            acceptor: data.acceptor ?? '',
            acceptorNickname: data.acceptor_nickname,
            amount: String(data.amount ?? '0'),
            makerVipTier: data.maker_vip_tier,
            makerVipCustomization: data.maker_vip_customization,
            acceptorVipTier: data.acceptor_vip_tier,
            acceptorVipCustomization: data.acceptor_vip_customization,
            messages: [],
            startedAt: Date.now(),
          });
        }
        break;
      }

      case 'bet_revealed': {
        const betId = String(data.id);
        const duel = duels.get(betId);
        const winner = data.winner as string | undefined;

        if (duel) {
          // Set winner immediately (needed for avatar-merge stop angle) + resolving phase
          setDuel(betId, { ...duel, phase: 'resolving', winner: winner ?? null });

          // resolving(0) → avatar-merge(+800ms) → winner-reveal(+9000ms) → fade-out(+19000ms) → remove
          // The 3D coin flip animation is 8s, so avatar-merge→winner-reveal needs ~8.2s
          const t1 = setTimeout(() => updatePhase(betId, 'avatar-merge'), 800);
          timersRef.current.set(`${betId}-merge`, t1);

          const t2 = setTimeout(() => {
            if (winner) revealWinner(betId, winner);
          }, 9000);
          timersRef.current.set(`${betId}-reveal`, t2);

          const t3 = setTimeout(() => {
            updatePhase(betId, 'fade-out');
            const t4 = setTimeout(() => removeDuel(betId), REMOVE_DELAY);
            timersRef.current.set(`${betId}-remove`, t4);
          }, 19000);
          timersRef.current.set(`${betId}-fadeout`, t3);
        }
        break;
      }

      case 'bet_reverted':
      case 'accept_failed': {
        // accept_failed uses { betId } key, bet_reverted uses { id } key
        const betId = String(data.id ?? data.betId);
        if (!betId || betId === 'undefined') break;
        // Clear all pending timers for this duel
        for (const [key, timer] of timersRef.current.entries()) {
          if (key.startsWith(betId)) {
            clearTimeout(timer);
            timersRef.current.delete(key);
          }
        }
        removeDuel(betId);
        break;
      }

      case 'bet_message': {
        const betId = String(data.bet_id);
        addMessage(betId, {
          id: data.id as string,
          address: data.address as string,
          nickname: data.nickname as string | undefined,
          message: data.message as string,
          created_at: data.created_at as string,
        });
        break;
      }
    }
  }, []);

  // Stale duel cleanup — safety net for missed WS events (e.g. network blip).
  // Duels older than 90s without a winner are removed to prevent ghost cards.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [betId, duel] of duels) {
        if (!duel.winner && now - duel.startedAt > STALE_DUEL_MAX_AGE) {
          removeDuel(betId);
        }
      }
    }, STALE_CLEANUP_INTERVAL);
    return () => {
      clearInterval(interval);
      for (const t of timersRef.current.values()) clearTimeout(t);
    };
  }, []);

  return {
    duels: snapshot,
    handleWsEvent,
    addMessage,
    removeDuel,
  };
}
