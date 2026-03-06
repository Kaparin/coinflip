'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { useOnlineCount } from '@/hooks/use-social';
import { SocialSheet } from './social-sheet';

export function SocialFab() {
  const [open, setOpen] = useState(false);
  const onlineCount = useOnlineCount();

  return (
    <>
      {/* Circular FAB — bottom-left, mirrors CreateBetFab style */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 z-40 group md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
      >
        {/* Main button */}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 shadow-lg transition-all duration-200 group-active:scale-90">
          <Users size={24} strokeWidth={2.5} className="text-white" />
          {/* Online count badge */}
          {onlineCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white text-emerald-600 px-1 text-[9px] font-bold shadow-sm">
              {onlineCount}
            </span>
          )}
        </span>
      </button>

      <SocialSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
