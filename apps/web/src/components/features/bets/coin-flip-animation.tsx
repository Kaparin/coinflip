'use client';

import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from '@/lib/i18n';
import { feedback } from '@/lib/feedback';
import type { CoinState } from '@/components/ui/coin-3d';

// Lazy-load 3D coin (SSR-safe, code-split)
const Coin3D = lazy(() =>
  import('@/components/ui/coin-3d').then((m) => ({ default: m.Coin3D }))
);

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

export function CoinFlipAnimation({
  result,
  isWin,
  isFlipping,
  onComplete,
}: CoinFlipAnimationProps) {
  const { t } = useTranslation();
  const [showResult, setShowResult] = useState(false);
  const [coinState, setCoinState] = useState<CoinState>('idle');
  const confetti = useConfetti(20, showResult && isWin === true);
  const flipSoundPlayed = useRef(false);
  const [canRender3D, setCanRender3D] = useState(false);

  // Only render 3D on client after mount (SSR-safe)
  useEffect(() => {
    setCanRender3D(true);
  }, []);

  // Drive coin state from props
  useEffect(() => {
    if (isFlipping) {
      setShowResult(false);
      setCoinState('flipping');
      if (!flipSoundPlayed.current) {
        feedback('coinFlip');
        flipSoundPlayed.current = true;
      }
    } else {
      flipSoundPlayed.current = false;
      if (!showResult) {
        setCoinState('idle');
      }
    }
  }, [isFlipping, showResult]);

  // When 3D flip completes
  const handleFlipComplete = () => {
    setCoinState('landed');
    setShowResult(true);
    onComplete?.();
  };

  // Play win/lose feedback when result is shown
  useEffect(() => {
    if (showResult && isWin !== undefined) {
      feedback(isWin ? 'win' : 'lose');
    }
  }, [showResult, isWin]);

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

      {/* 3D Coin */}
      <div className={`relative transition-all duration-500 ${
        showResult && result
          ? isWin
            ? 'win-glow rounded-full'
            : 'loss-glow rounded-full'
          : ''
      }`}>
        {canRender3D ? (
          <Suspense fallback={<CoinFallback isFlipping={isFlipping} />}>
            <Coin3D
              state={coinState}
              result={result ?? 'heads'}
              onFlipComplete={handleFlipComplete}
              size={160}
            />
          </Suspense>
        ) : (
          <CoinFallback isFlipping={isFlipping} />
        )}
      </div>

      {/* Result text */}
      {showResult && result && (
        <div className="animate-fade-up text-center">
          <p className={`text-xl font-bold ${isWin ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
            {isWin ? t('coinFlip.youWin') : t('coinFlip.youLose')}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] capitalize mt-1">
            {result === 'heads' ? t('coinFlip.resultHeads') : t('coinFlip.resultTails')}
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

/** CSS fallback while 3D loads or for reduced-motion */
function CoinFallback({ isFlipping }: { isFlipping: boolean }) {
  return (
    <div
      className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-4xl ${
        isFlipping ? 'animate-coin-flip border-[var(--color-primary)]' : 'border-[var(--color-border)]'
      }`}
    >
      🪙
    </div>
  );
}
