'use client';

import type { ReactNode } from 'react';

interface FlipCardProps {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

/**
 * CSS 3D flip card with dynamic height.
 * The visible side determines the height; the hidden side is positioned absolutely.
 * On flip, the transition animates the container, and the newly-visible side becomes
 * the layout driver while the old side becomes absolute.
 */
export function FlipCard({ flipped, front, back, className = '' }: FlipCardProps) {
  return (
    <div className={`flip-card ${className}`}>
      <div className={`flip-card-inner ${flipped ? 'flipped' : ''}`}>
        {/* Front — drives height when not flipped, absolute when flipped */}
        <div className={flipped ? 'flip-card-face-hidden' : 'flip-card-face-visible'}>
          {front}
        </div>
        {/* Back — drives height when flipped, absolute when not flipped */}
        <div className={flipped ? 'flip-card-face-visible flip-card-back' : 'flip-card-face-hidden flip-card-back'}>
          {back}
        </div>
      </div>
    </div>
  );
}
