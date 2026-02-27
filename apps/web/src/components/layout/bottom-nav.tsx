'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Puzzle, User, Trophy, Newspaper, ShoppingCart } from 'lucide-react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetActiveEvents } from '@coinflip/api-client';
import { useTranslation } from '@/lib/i18n';
import { PRESALE_CONTRACT } from '@/lib/constants';

const BASE_NAV_ITEMS = [
  {
    href: '/game',
    labelKey: 'nav.play' as const,
    icon: <Puzzle size={20} />,
  },
  {
    href: '/game/news',
    labelKey: 'nav.news' as const,
    icon: <Newspaper size={20} />,
  },
  {
    href: '/game/profile',
    labelKey: 'nav.profile' as const,
    icon: <User size={20} />,
  },
];

const PRESALE_NAV_ITEM = {
  href: '/game/presale',
  labelKey: 'nav.presale' as const,
  icon: <ShoppingCart size={20} />,
};

const NAV_ITEMS = PRESALE_CONTRACT
  ? [BASE_NAV_ITEMS[0]!, PRESALE_NAV_ITEM, ...BASE_NAV_ITEMS.slice(1)]
  : BASE_NAV_ITEMS;

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { data: activeEventsData } = useGetActiveEvents({
    query: { staleTime: 60_000, refetchInterval: 120_000 },
  });

  const activeCount = (activeEventsData as unknown as { data?: unknown[] })?.data?.length ?? 0;

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

        <Link
          href="/game/events"
          className={`relative flex flex-col items-center gap-0.5 px-4 py-2.5 text-[10px] font-medium transition-colors ${
            pathname?.startsWith('/game/events')
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)]'
          }`}
        >
          <Trophy size={20} />
          <span>{t('nav.events')}</span>
          {activeCount > 0 && (
            <span className="absolute -top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-warning)] px-1 text-[9px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
