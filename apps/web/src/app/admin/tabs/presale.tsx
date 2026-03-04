'use client';

/**
 * Presale admin tab — deprecated.
 * Presale contract management has been replaced by the shop system
 * with flexible pricing via platform_config.
 */
export function PresaleTab() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Presale контракт больше не используется. Управление магазином перенесено во вкладку &quot;Магазин&quot;.
      </p>
    </div>
  );
}
