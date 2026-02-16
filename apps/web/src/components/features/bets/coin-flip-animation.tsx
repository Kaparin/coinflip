'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';

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
  const confetti = useConfetti(20, showResult && isWin === true);

  useEffect(() => {
    if (isFlipping) {
      setShowResult(false);
      const timer = setTimeout(() => {
        setShowResult(true);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isFlipping, onComplete]);

  return (
    <div className="relative flex flex-col items-center gap-4 py-6 overflow-hidden">
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

      {/* Coin */}
      <div
        className={`relative flex h-24 w-24 items-center justify-center rounded-full border-4 text-4xl transition-all duration-300 ${
          isFlipping && !showResult
            ? 'animate-coin-flip border-[var(--color-primary)]'
            : showResult && result
              ? isWin
                ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 win-glow animate-bounce-in'
                : 'border-[var(--color-danger)] bg-[var(--color-danger)]/10 loss-glow animate-shake'
              : 'border-[var(--color-border)]'
        }`}
        style={{ perspective: '1000px' }}
      >
        {showResult && result ? (
          result === 'heads' ? '👑' : '🪙'
        ) : (
          '🪙'
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
