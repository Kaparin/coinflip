'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Send } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { UserAvatar, LaunchTokenIcon } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { useTranslation } from '@/lib/i18n';
import { useWalletContext } from '@/contexts/wallet-context';
import { API_URL } from '@/lib/constants';
import type { ActiveDuel, DuelMessage } from '@/hooks/use-active-duels';

interface DuelCardProps {
  duel: ActiveDuel;
  onSendMessage?: (betId: string, message: string) => void;
}

function shortenAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function PlayerSide({
  address,
  nickname,
  vipTier,
  vipCustomization,
  isWinner,
  isLoser,
}: {
  address: string;
  nickname?: string | null;
  vipTier?: string | null;
  vipCustomization?: any;
  isWinner: boolean;
  isLoser: boolean;
}) {
  const nameClass = getVipNameClass(vipTier, vipCustomization?.nameGradient);
  const frameStyle = vipCustomization?.frameStyle;

  return (
    <Link href={`/game/profile/${address}`} className="flex flex-col items-center gap-1 group shrink-0">
      <div className={`transition-all duration-500 ${isWinner ? 'animate-duel-winner' : ''} ${isLoser ? 'animate-duel-loser' : ''}`}>
        <VipAvatarFrame tier={vipTier} frameStyle={frameStyle}>
          <UserAvatar address={address} size={40} />
        </VipAvatarFrame>
      </div>
      <span
        className={`text-[10px] font-medium truncate max-w-[80px] group-hover:underline ${nameClass || 'text-[var(--color-text-secondary)]'}`}
        title={nickname || address}
      >
        {nickname || shortenAddress(address)}
      </span>
    </Link>
  );
}

const CONFETTI_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

/** Deterministic pseudo-random based on seed — avoids hydration mismatch from Math.random() */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function Confetti() {
  const particles = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: `${seededRandom(i * 7 + 1) * 100}%`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${seededRandom(i * 13 + 2) * 0.6}s`,
      duration: `${1 + seededRandom(i * 17 + 3)}s`,
      rotate: seededRandom(i * 23 + 4) * 360,
      size: 4 + seededRandom(i * 31 + 5) * 4,
    })),
  []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            left: p.left,
            top: '-4px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function DuelCard({ duel, onSendMessage }: DuelCardProps) {
  const { t } = useTranslation();
  const { address: myAddress } = useWalletContext();
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);

  const isParticipant = myAddress &&
    (myAddress.toLowerCase() === duel.maker.toLowerCase() ||
     myAddress.toLowerCase() === duel.acceptor.toLowerCase());

  const isWinnerMaker = duel.winner?.toLowerCase() === duel.maker.toLowerCase();
  const isWinnerAcceptor = duel.winner?.toLowerCase() === duel.acceptor.toLowerCase();
  const hasWinner = !!duel.winner;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [duel.messages]);

  const handleSend = useCallback(async () => {
    const text = msgInput.trim();
    if (!text || sending || !isParticipant) return;
    setSending(true);
    setMsgInput('');
    try {
      const token = typeof window !== 'undefined'
        ? sessionStorage.getItem('coinflip_auth_token')
        : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_URL}/api/v1/bets/${duel.betId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ message: text }),
      });
    } catch {
      // Silently ignore — message will appear via WS if successful
    }
    setSending(false);
  }, [msgInput, sending, isParticipant, duel.betId]);

  const isFading = duel.phase === 'fade-out';

  return (
    <div
      className={`relative rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/5 to-[var(--color-surface)] p-3 overflow-hidden ${
        isFading ? 'animate-duel-fade-out' : 'animate-fade-up animate-duel-border-glow'
      }`}
    >
      {/* Confetti on winner reveal */}
      {duel.phase === 'winner-reveal' && <Confetti />}

      {/* Header: LIVE badge + amount */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 animate-live-pulse" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
            {t('duel.live')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold tabular-nums">{formatLaunch(duel.amount)}</span>
          <LaunchTokenIcon size={28} />
        </div>
      </div>

      {/* Players */}
      <div className="flex items-start justify-between mb-3">
        <PlayerSide
          address={duel.maker}
          nickname={duel.makerNickname}
          vipTier={duel.makerVipTier}
          vipCustomization={duel.makerVipCustomization}
          isWinner={hasWinner && isWinnerMaker}
          isLoser={hasWinner && !isWinnerMaker}
        />

        {/* Center: spinning coin or winner text */}
        <div className="flex flex-col items-center justify-center flex-1 py-1">
          {duel.phase === 'winner-reveal' && duel.winner ? (
            <div className="animate-duel-winner text-center">
              <div className="text-xs font-bold text-emerald-400 mb-0.5">
                {t('duel.winner')}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                +{formatLaunch(String(BigInt(duel.amount) * 2n * 9n / 10n))}
              </div>
            </div>
          ) : (
            <div className="duel-coin-3d animate-duel-coin-spin">
              <div className="duel-coin-face duel-coin-front">
                <Image
                  src="/coin-token-logo.png"
                  alt="COIN front"
                  width={44}
                  height={44}
                  className="rounded-full"
                  unoptimized
                />
              </div>
              <div className="duel-coin-face duel-coin-back-face">
                <Image
                  src="/coin-token-logo.back.png"
                  alt="COIN back"
                  width={44}
                  height={44}
                  className="rounded-full"
                  unoptimized
                />
              </div>
            </div>
          )}
          {duel.phase === 'resolving' && (
            <span className="text-[9px] text-[var(--color-text-secondary)] mt-1 animate-live-pulse">
              {t('duel.determining')}
            </span>
          )}
        </div>

        <PlayerSide
          address={duel.acceptor}
          nickname={duel.acceptorNickname}
          vipTier={duel.acceptorVipTier}
          vipCustomization={duel.acceptorVipCustomization}
          isWinner={hasWinner && isWinnerAcceptor}
          isLoser={hasWinner && !isWinnerAcceptor}
        />
      </div>

      {/* Chat area */}
      <div
        ref={chatRef}
        className="bg-[var(--color-bg)]/60 rounded-lg p-2 max-h-[72px] overflow-y-auto scrollbar-hide mb-2 space-y-1"
      >
        {duel.messages.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-secondary)] text-center italic">
            {t('duel.noMessages')}
          </p>
        ) : (
          duel.messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              msg={msg}
              isMaker={msg.address.toLowerCase() === duel.maker.toLowerCase()}
            />
          ))
        )}
      </div>

      {/* Input (participants only) */}
      {isParticipant && duel.phase !== 'fade-out' && (
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value.slice(0, 100))}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('duel.messagePlaceholder')}
            disabled={sending}
            className="flex-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none focus:border-[var(--color-primary)]/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!msgInput.trim() || sending}
            className="shrink-0 rounded-lg bg-[var(--color-primary)]/20 px-2.5 py-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 disabled:opacity-30 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ msg, isMaker }: { msg: DuelMessage; isMaker: boolean }) {
  const displayName = msg.nickname || shortenAddress(msg.address);
  return (
    <div className="animate-chat-bubble text-[10px] leading-tight">
      <span className={`font-medium ${isMaker ? 'text-indigo-400' : 'text-cyan-400'}`}>
        {displayName}:
      </span>{' '}
      <span className="text-[var(--color-text)]/80">{msg.message}</span>
    </div>
  );
}
