'use client';

import { useEffect, useState } from 'react';

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#06b6d4', '#f43f5e', '#a855f7', '#fbbf24'];

interface Piece {
  id: number;
  color: string;
  tx: string;
  ty: string;
  rot: string;
  left: string;
  top: string;
  delay: string;
  shape: 'square' | 'circle' | 'rect';
}

function generatePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    tx: `${(Math.random() - 0.5) * 300}px`,
    ty: `${-Math.random() * 200 - 50}px`,
    rot: `${Math.random() * 720 - 360}deg`,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 40 + 30}%`,
    delay: `${Math.random() * 0.3}s`,
    shape: (['square', 'circle', 'rect'] as const)[Math.floor(Math.random() * 3)]!,
  }));
}

interface ConfettiProps {
  active: boolean;
  count?: number;
}

export function Confetti({ active, count = 30 }: ConfettiProps) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (active) {
      setPieces(generatePieces(count));
      const timer = setTimeout(() => setPieces([]), 1200);
      return () => clearTimeout(timer);
    }
    setPieces([]);
  }, [active, count]);

  if (pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            top: p.top,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'rect' ? '1px' : '2px',
            width: p.shape === 'rect' ? '4px' : '8px',
            height: p.shape === 'rect' ? '12px' : '8px',
            animationDelay: p.delay,
            '--tx': p.tx,
            '--ty': p.ty,
            '--rot': p.rot,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
