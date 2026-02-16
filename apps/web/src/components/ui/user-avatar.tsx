'use client';

import Avatar from 'boring-avatars';

const PALETTE = ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#10b981'];

export interface UserAvatarProps {
  address: string;
  size?: number;
  className?: string;
}

export function UserAvatar({ address, size = 32, className = '' }: UserAvatarProps) {
  return (
    <span className={`inline-flex shrink-0 rounded-full overflow-hidden ${className}`}>
      <Avatar
        size={size}
        name={address}
        variant="beam"
        colors={PALETTE}
      />
    </span>
  );
}
