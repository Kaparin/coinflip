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

  // Needs re-auth: authz exists but feegrant is missing
  const needsReauth = oneClickEnabled && !gasSponsored;

  const chips = [
    {
      key: 'oneclick',
      icon: <MousePointerClick size={14} />,
      label: t('statusChips.oneClick'),
      enabled: oneClickEnabled && !needsReauth,
      warning: needsReauth,
      clickable: !oneClickEnabled || needsReauth,
    },
    {
      key: 'gas',
      icon: <Flame size={14} />,
      label: t('statusChips.gas'),
      enabled: gasSponsored,
      warning: false,
      clickable: needsReauth,
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
            className={`flex shrink-0 items-center justify-center gap-1 rounded-lg border text-[11px] font-medium transition-all min-w-0 ${
              compact ? 'h-7 w-7 p-0' : 'px-2.5 py-1'
            } ${
              chip.enabled
                ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)] shadow-[0_0_8px_rgba(34,197,94,0.15)]'
                : chip.warning || isClickable
                  ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)] cursor-pointer hover:bg-[var(--color-warning)]/20 active:scale-[0.96]'
                  : 'border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] opacity-50'
            }`}
            title={
              chip.warning
                ? t('statusChips.reauthorize')
                : `${chip.label}: ${chip.enabled ? t('statusChips.active') : t('statusChips.notSetUp')}`
            }
          >
            {chip.icon}
            {!compact && <span>{chip.label}</span>}
          </Component>
        );
      })}
    </div>
  );
}
