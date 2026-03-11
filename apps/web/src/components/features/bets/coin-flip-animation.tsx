'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';
import { feedback } from '@/lib/feedback';

interface CoinFlipAnimationProps {
  result?: 'heads' | 'tails';
  isWin?: boolean;
  isFlipping: boolean;
  onComplete?: () => void;
}

/** Generate random confetti particles */
function useConfetti(count: number, trigger: boolean) {
  return useMemo(() => {
    if (!trigger) return [];
    const colors = ['#22c55e', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4'];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      left: `${10 + Math.random() * 80}%`,
      delay: `${Math.random() * 0.5}s`,
      rotation: `${Math.random() * 360}deg`,
      size: 4 + Math.random() * 4,
    }));
  }, [count, trigger]);
}

const FLIP_DURATION = 2200; // ms — matches CSS animation

export function CoinFlipAnimation({
  result,
  isWin,
  isFlipping,
  onComplete,
}: CoinFlipAnimationProps) {
  const { t } = useTranslation();
  const [showResult, setShowResult] = useState(false);
  const confetti = useConfetti(20, showResult && isWin === true);
  const flipSoundPlayed = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Drive coin state from props
  useEffect(() => {
    if (isFlipping) {
      setShowResult(false);
      if (!flipSoundPlayed.current) {
        feedback('coinFlip');
        flipSoundPlayed.current = true;
      }
      timerRef.current = setTimeout(() => {
        setShowResult(true);
        onComplete?.();
      }, FLIP_DURATION);
    } else {
      flipSoundPlayed.current = false;
      setShowResult(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isFlipping, onComplete]);

  // Play win/lose feedback when result is shown
  useEffect(() => {
    if (showResult && isWin !== undefined) {
      feedback(isWin ? 'win' : 'lose');
    }
  }, [showResult, isWin]);

  const coinSize = 128;
  const isLanded = showResult && result;

  // Choose animation class: lands on correct face based on result
  const flipClass =
    isFlipping && !showResult
      ? result === 'tails'
        ? 'animate-coin-flip-to-tails'
        : 'animate-coin-flip-to-heads'
      : '';

  return (
    <div className="relative flex flex-col items-center gap-2 py-4 overflow-hidden">
      {/* Confetti on win */}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            backgroundColor: p.color,
            left: p.left,
            top: '-8px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: p.delay,
            transform: `rotate(${p.rotation})`,
          }}
        />
      ))}

      {/* CSS 3D Coin */}
      <div
        className={`relative transition-all duration-500 ${
          isLanded
            ? isWin
              ? 'win-glow rounded-full'
              : 'loss-glow rounded-full'
            : ''
        }`}
      >
        <div style={{ perspective: 800 }}>
          <div
            className={flipClass}
            style={{
              width: coinSize,
              height: coinSize,
              transformStyle: 'preserve-3d',
              ...(isLanded
                ? { transform: `rotateY(${result === 'heads' ? 0 : 180}deg)` }
                : {}),
            }}
          >
            <div className="duel-coin-face duel-coin-front">
              <Image
                src="/coin-token-logo.png"
                alt="Heads"
                width={coinSize}
                height={coinSize}
                className="rounded-full"
                unoptimized
              />
            </div>
            <div className="duel-coin-face duel-coin-back-face">
              <Image
                src="/coin-token-logo.back.png"
                alt="Tails"
                width={coinSize}
                height={coinSize}
                className="rounded-full"
                unoptimized
              />
            </div>
          </div>
        </div>
      </div>

      {/* Result text */}
      {showResult && result && (
        <div className="animate-fade-up text-center">
          <p
            className={`text-xl font-bold ${isWin ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
          >
            {isWin ? t('coinFlip.youWin') : t('coinFlip.youLose')}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] capitalize mt-1">
            {result === 'heads'
              ? t('coinFlip.resultHeads')
              : t('coinFlip.resultTails')}
          </p>
        </div>
      )}

      {isFlipping && !showResult && (
        <p className="text-sm text-[var(--color-text-secondary)] animate-pulse">
          {t('coinFlip.flipping')}
        </p>
      )}
    </div>
  );
}
