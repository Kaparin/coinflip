'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Puzzle, User } from 'lucide-react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';

const NAV_ITEMS = [
  {
    href: '/game',
    labelKey: 'nav.play' as const,
    icon: <Puzzle size={20} />,
  },
  {
    href: '/game/profile',
    labelKey: 'nav.profile' as const,
    icon: <User size={20} />,
  },
];

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-lg pb-safe md:hidden">
      <div className="flex items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/game'
            ? pathname === '/game'
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
