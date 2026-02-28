'use client';

export interface AxmIconProps {
  /** Size in pixels. Default: 16 */
  size?: number;
  className?: string;
}

/** AXM native token icon — circular badge with coin background */
export function AxmIcon({ size = 16, className = '' }: AxmIconProps) {
  return (
    <span
      role="img"
      aria-label="AXM"
      className={`inline-block shrink-0 rounded-full overflow-clip bg-cover bg-center align-middle ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: "url('/axm.png')",
      }}
    />
  );
}
