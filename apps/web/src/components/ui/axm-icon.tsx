'use client';

import Image from 'next/image';

const AXM_LOGO = '/axm.png';

export interface AxmIconProps {
  /** Size in pixels. Default: 16 */
  size?: number;
  className?: string;
}

/** AXM native token icon — circular badge */
export function AxmIcon({ size = 16, className = '' }: AxmIconProps) {
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
