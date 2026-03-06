'use client';

import Image from 'next/image';
import { isAxmMode } from '@/lib/constants';

const LAUNCH_TOKEN_LOGO = '/coin-token-logo.png';
const AXM_LOGO = '/axm.png';

export interface LaunchTokenIconProps {
  /** Size in pixels. Default: 48 */
  size?: number;
  className?: string;
}

/** LAUNCH token logo — use next to balances and amounts instead of "LAUNCH" text */
export function LaunchTokenIcon({ size = 48, className = '' }: LaunchTokenIconProps) {
  return (
    <Image
      src={LAUNCH_TOKEN_LOGO}
      alt="COIN"
      width={size}
      height={size}
      className={`inline-block align-middle object-contain shrink-0 ${className}`}
    />
  );
}

/**
 * Game token icon — auto-selects COIN or AXM icon based on GAME_CURRENCY mode.
 * Use this everywhere game amounts are displayed.
 */
export function GameTokenIcon({ size = 16, className = '' }: LaunchTokenIconProps) {
  if (isAxmMode()) {
    return (
      <Image
        src={AXM_LOGO}
        alt="AXM"
        width={size}
        height={size}
        className={`inline-block align-middle object-cover shrink-0 rounded-full ${className}`}
      />
    );
  }
  return <LaunchTokenIcon size={size} className={className} />;
}

/**
 * AXM token icon — always shows AXM regardless of GAME_CURRENCY mode.
 * Use for prizes (events, raffles) which are always in native AXM.
 */
export function AxmTokenIcon({ size = 16, className = '' }: LaunchTokenIconProps) {
  return (
    <Image
      src={AXM_LOGO}
      alt="AXM"
      width={size}
      height={size}
      className={`inline-block align-middle object-cover shrink-0 rounded-full ${className}`}
    />
  );
}
