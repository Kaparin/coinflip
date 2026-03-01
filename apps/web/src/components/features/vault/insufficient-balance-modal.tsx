'use client';

import { Modal } from '@/components/ui/modal';
import { LaunchTokenIcon } from '@/components/ui';
import { useDepositTrigger } from '@/contexts/deposit-trigger-context';
import { useTranslation } from '@/lib/i18n';
import { fromMicroLaunch, formatLaunch } from '@coinflip/shared/constants';

interface InsufficientBalanceModalProps {
  open: boolean;
  onClose: () => void;
  /** Required amount in micro units */
  requiredAmount: string;
  /** Available amount in micro units */
  availableAmount: string;
}

export function InsufficientBalanceModal({
  open,
  onClose,
  requiredAmount,
  availableAmount,
}: InsufficientBalanceModalProps) {
  const { t } = useTranslation();
  const { openDeposit } = useDepositTrigger();

  const requiredMicro = BigInt(requiredAmount);
  const availableMicro = BigInt(availableAmount);
  const shortfall = requiredMicro - availableMicro;

  const handleDeposit = () => {
    onClose();
    // Small delay so close animation finishes before deposit opens
    setTimeout(() => openDeposit(), 250);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('bets.insufficientTitle')}>
      <div className="space-y-4">
        {/* Required */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--color-bg)] p-3">
          <span className="text-sm text-[var(--color-text-secondary)]">{t('bets.insufficientRequired')}</span>
          <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums">
            {formatLaunch(requiredAmount)} <LaunchTokenIcon size={40} />
          </span>
        </div>

        {/* Available */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--color-bg)] p-3">
          <span className="text-sm text-[var(--color-text-secondary)]">{t('bets.insufficientAvailable')}</span>
          <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-[var(--color-text)]">
            {formatLaunch(availableAmount)} <LaunchTokenIcon size={40} />
          </span>
        </div>

        {/* Shortfall */}
        <div className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/10 p-3">
          <span className="text-sm text-[var(--color-text-secondary)]">{t('bets.insufficientShortfall')}</span>
          <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-red-400">
            {fromMicroLaunch(Number(shortfall > 0n ? shortfall : 0n)).toLocaleString('en-US', { maximumFractionDigits: 2 })} <LaunchTokenIcon size={40} />
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
          <button
            type="button"
            onClick={handleDeposit}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.25)] active:scale-[0.98]"
          >
            {t('bets.insufficientDeposit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
