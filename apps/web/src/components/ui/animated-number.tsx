'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (n: number) => string;
}

/**
 * Animates a number from its previous value to the new value.
 * Uses requestAnimationFrame for smooth 60fps transitions.
 */
export function AnimatedNumber({
  value,
  duration = 600,
  className = '',
  formatter = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 }),
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);
  const animFrameRef = useRef<number>(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    prevValueRef.current = value;

    if (from === to) return;

    // Flash direction
    setFlash(to > from ? 'up' : 'down');
    const flashTimer = setTimeout(() => setFlash(null), 800);

    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(to);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(flashTimer);
    };
  }, [value, duration]);

  const flashClass = flash === 'up'
    ? 'text-emerald-400'
    : flash === 'down'
      ? 'text-red-400'
      : '';

  return (
    <span className={`tabular-nums transition-colors duration-500 ${flashClass} ${className}`}>
      {formatter(displayValue)}
    </span>
  );
}
