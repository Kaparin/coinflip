'use client';

import Image from 'next/image';

const LAUNCH_TOKEN_LOGO = '/launch-token-logo.png';

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
      alt="LAUNCH"
      width={size}
      height={size}
      className={`inline-block align-middle object-contain shrink-0 ${className}`}
    />
  );
}
