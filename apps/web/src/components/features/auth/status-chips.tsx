'use client';

import { MousePointerClick, Flame } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export interface StatusChipsProps {
  oneClickEnabled?: boolean;
  gasSponsored?: boolean;
  compact?: boolean;
  onSetupClick?: () => void;
}

export function StatusChips({
  oneClickEnabled = false,
  gasSponsored = false,
  compact = false,
  onSetupClick,
}: StatusChipsProps) {
  const { t } = useTranslation();

  const chips = [
    {
      key: 'oneclick',
      icon: <MousePointerClick size={14} />,
      label: t('statusChips.oneClick'),
      enabled: oneClickEnabled,
      clickable: !oneClickEnabled,
    },
    {
      key: 'gas',
      icon: <Flame size={14} />,
      label: t('statusChips.gas'),
      enabled: gasSponsored,
      clickable: false,
    },
  ] as const;

  return (
    <div className="flex gap-1.5">
      {chips.map((chip) => {
        const isClickable = chip.clickable && onSetupClick;
        const Component = isClickable ? 'button' : 'div';
        return (
          <Component
            key={chip.key}
            {...(isClickable ? { type: 'button' as const, onClick: onSetupClick } : {})}
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors min-w-0 ${
              chip.enabled
                ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                : isClickable
                  ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] cursor-pointer hover:bg-[var(--color-warning)]/25 active:scale-[0.98]'
                  : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
            title={`${chip.label}: ${chip.enabled ? t('statusChips.active') : t('statusChips.notSetUp')}`}
          >
            {chip.icon}
            {!compact && <span>{chip.label}</span>}
          </Component>
        );
      })}
    </div>
  );
}
