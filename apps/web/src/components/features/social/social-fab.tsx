'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useOnlineCount } from '@/hooks/use-social';
import { SocialSheet } from './social-sheet';

export function SocialFab() {
  const [open, setOpen] = useState(false);
  const onlineCount = useOnlineCount();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 z-40 group md:bottom-6"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
      >
        {/* Main button */}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-bg)] border border-[var(--color-border)] shadow-xl transition-all duration-200 group-active:scale-90">
          <Image
            src="/users-chat.png"
            alt="Social"
            width={28}
            height={28}
            className="pointer-events-none"
          />
          {/* Online count badge */}
          {onlineCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-success)] px-1 text-[9px] font-bold text-white shadow-sm">
              {onlineCount}
            </span>
          )}
        </span>
      </button>

      <SocialSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
