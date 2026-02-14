export interface StatusChipsProps {
  /** Whether the user has granted authz for 1-click gameplay */
  oneClickEnabled?: boolean;
  /** Whether the relayer has an active feegrant for gas sponsoring */
  gasSponsored?: boolean;
  /** Compact mode — hides labels, only shows icons + status */
  compact?: boolean;
}

export function StatusChips({
  oneClickEnabled = false,
  gasSponsored = false,
  compact = false,
}: StatusChipsProps) {
  const chips = [
    {
      key: 'oneclick',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
        </svg>
      ),
      label: '1-Click',
      enabled: oneClickEnabled,
      enabledText: 'Enabled',
      disabledText: 'Disabled',
    },
    {
      key: 'gas',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
        </svg>
      ),
      label: 'Gas',
      enabled: gasSponsored,
      enabledText: 'Sponsored',
      disabledText: 'Not sponsored',
    },
  ] as const;

  return (
    <div className="flex gap-2">
      {chips.map((chip) => (
        <div
          key={chip.key}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            chip.enabled
              ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
              : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
          }`}
          title={`${chip.label}: ${chip.enabled ? chip.enabledText : chip.disabledText}`}
        >
          {chip.icon}
          {!compact && (
            <span>
              {chip.label}: {chip.enabled ? chip.enabledText : chip.disabledText}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
