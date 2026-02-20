'use client';

import { useState, useCallback } from 'react';
import { CircleDollarSign } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';

interface CreateBetFabProps {
  onBetSubmitted?: (bet: { txHash: string; amount: string; maker: string }) => void;
}

export function CreateBetFab({ onBetSubmitted }: CreateBetFabProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const { isConnected } = useWalletContext();
  const { t } = useTranslation();

  const handleClose = useCallback(() => setOpen(false), []);
  const handleSubmitComplete = useCallback(() => setOpen(false), []);

  if (!isConnected) return null;

  return (
    <>
      {/* FAB — only on mobile, positioned above bottom navbar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 z-40 flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/25 transition-transform active:scale-95 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
      >
        <CircleDollarSign size={20} />
        {t('wager.title')}
      </button>

      {/* Bottom sheet modal with bet form */}
      <Modal open={open} onClose={handleClose} title={t('wager.title')}>
        <CreateBetForm
          variant="flat"
          onBetSubmitted={onBetSubmitted}
          controlledAmount={amount}
          onAmountChange={setAmount}
          onSubmitComplete={handleSubmitComplete}
        />
      </Modal>
    </>
  );
}
