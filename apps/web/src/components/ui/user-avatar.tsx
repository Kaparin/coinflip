'use client';

import { useMemo } from 'react';

// ─── Boring-avatars "beam" reproduction ──────────────────────
// Same algorithm as boring-avatars beam variant + coin-3d.tsx
const PALETTE = ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#10b981'];
const BEAM_SIZE = 36;

function boringHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getDigit(num: number, pos: number): number {
  return Math.floor(num / Math.pow(10, pos)) % 10;
}

function getBoolean(num: number, pos: number): boolean {
  return !(getDigit(num, pos) % 2);
}

function getUnit(num: number, range: number, index?: number): number {
  const value = num % range;
  return index !== undefined && getDigit(num, index) % 2 === 0 ? -value : value;
}

function getContrast(hexColor: string): string {
  const hex = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#FFFFFF';
}

/** Generate beam avatar SVG data URL */
function generateBeamDataUrl(address: string, size: number): string {
  const num = boringHash(address);
  const c = BEAM_SIZE;
  const pLen = PALETTE.length;

  const wrapperColor = PALETTE[num % pLen]!;
  const faceColor = getContrast(wrapperColor);
  const backgroundColor = PALETTE[(num + 13) % pLen]!;

  const tx0 = getUnit(num, 10, 1);
  const wrapperTranslateX = tx0 < 5 ? tx0 + c / 9 : tx0;
  const ty0 = getUnit(num, 10, 2);
  const wrapperTranslateY = ty0 < 5 ? ty0 + c / 9 : ty0;
  const wrapperRotate = getUnit(num, 360);
  const wrapperScale = 1 + getUnit(num, c / 12) / 10;
  const isCircle = getBoolean(num, 1);
  const isMouthOpen = getBoolean(num, 2);
  const eyeSpread = getUnit(num, 5);
  const mouthSpread = getUnit(num, 3);
  const faceRotate = getUnit(num, 10, 3);
  const faceTranslateX = wrapperTranslateX > c / 6 ? wrapperTranslateX / 2 : getUnit(num, 8, 1);
  const faceTranslateY = wrapperTranslateY > c / 6 ? wrapperTranslateY / 2 : getUnit(num, 7, 2);

  const wrapperRx = isCircle ? c : c / 6;
  const wrapperTransform = `translate(${wrapperTranslateX} ${wrapperTranslateY}) rotate(${wrapperRotate} ${c / 2} ${c / 2}) scale(${wrapperScale})`;
  const faceTransform = `translate(${faceTranslateX} ${faceTranslateY}) rotate(${faceRotate} ${c / 2} ${c / 2})`;

  const mouth = isMouthOpen
    ? `<path d="M15 ${19 + mouthSpread}c2 1 4 1 6 0" stroke="${faceColor}" fill="none" stroke-linecap="round"/>`
    : `<path d="M13,${19 + mouthSpread} a1,0.75 0 0,0 10,0" fill="${faceColor}"/>`;

  const maskId = `bm${num}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c} ${c}" width="${size}" height="${size}">
<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${c}" height="${c}">
<rect width="${c}" height="${c}" rx="${c * 2}" fill="#FFFFFF"/>
</mask>
<g mask="url(#${maskId})">
<rect width="${c}" height="${c}" fill="${backgroundColor}"/>
<rect x="0" y="0" width="${c}" height="${c}" fill="${wrapperColor}" rx="${wrapperRx}" transform="${wrapperTransform}"/>
<g transform="${faceTransform}">
${mouth}
<rect x="${14 - eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${faceColor}"/>
<rect x="${20 + eyeSpread}" y="14" width="1.5" height="2" rx="1" fill="${faceColor}"/>
</g>
</g>
</svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export interface UserAvatarProps {
  address: string;
  size?: number;
  className?: string;
  /** Render as flat circle (no 3D coin effect). Used inside duel coin animations. */
  flat?: boolean;
}

/**
 * 3D coin avatar — renders the boring-avatars beam pattern on a coin face
 * with metallic gold rim and subtle wobble animation.
 * Pure CSS 3D transforms — no WebGL overhead.
 */
export function UserAvatar({ address, size = 32, className = '', flat = false }: UserAvatarProps) {
  const avatarUrl = useMemo(() => generateBeamDataUrl(address, 256), [address]);
  const rim = Math.max(2, Math.round(size * 0.06));
  // Small avatars render flat — 3D effect not visible at <24px
  const isFlat = flat || size < 24;

  if (isFlat) {
    return (
      <span
        className={`inline-flex shrink-0 rounded-full overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          background: `url("${avatarUrl}") center/cover`,
          border: `${rim}px solid #c9a227`,
        }}
      />
    );
  }

  // Stagger animation so avatars don't wobble in sync
  const delay = -(boringHash(address) % 4000);

  return (
    <span
      className={`coin-avatar inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size, perspective: size * 3 }}
    >
      <span
        className="coin-avatar-body"
        style={{ width: size, height: size, transformStyle: 'preserve-3d', animationDelay: `${delay}ms` }}
      >
        {/* Front face — beam avatar */}
        <span
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: `url("${avatarUrl}") center/cover`,
            border: `${rim}px solid #c9a227`,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15), inset 0 2px 4px rgba(255,255,255,0.2)',
            backfaceVisibility: 'hidden',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
        {/* Edge — visible on tilt, gives depth */}
        <span
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d4a829 0%, #b8941f 40%, #e8c84a 60%, #c9a227 100%)',
            position: 'absolute',
            top: 0,
            left: 0,
            transform: 'translateZ(-1px)',
            backfaceVisibility: 'hidden',
          }}
        />
      </span>
    </span>
  );
}
