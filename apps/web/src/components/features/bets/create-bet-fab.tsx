'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { LaunchTokenIcon } from '@/components/ui';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';

interface CreateBetFabProps {
  onBetSubmitted?: (bet: { txHash: string; amount: string; maker: string }) => void;
}

export function CreateBetFab({ onBetSubmitted }: CreateBetFabProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isConnected } = useWalletContext();
  const { t } = useTranslation();
  const onCloseRef = useRef(() => setOpen(false));

  useEffect(() => { setMounted(true); }, []);

  // Animate in/out
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => { cancelAnimationFrame(id); };
    } else {
      setVisible(false);
      document.body.style.overflow = '';
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Android back button
  useEffect(() => {
    if (!open) return;
    history.pushState({ betModal: true }, '');
    const handlePopState = () => onCloseRef.current();
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [open]);

  const handleClose = useCallback(() => setOpen(false), []);
  const handleSubmitComplete = useCallback(() => setOpen(false), []);

  if (!isConnected) return null;

  return (
    <>
      {/* Circular FAB — bottom-right, mobile only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 z-40 md:hidden group"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
      >
        {/* Outer glow ring */}
        <span className="absolute inset-0 rounded-full bg-[var(--color-primary)] animate-[fabPing_2s_ease-out_infinite] opacity-0" />

        {/* Main button */}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-indigo-600 shadow-xl shadow-[var(--color-primary)]/30 transition-all duration-200 group-active:scale-90">
          <Plus size={26} strokeWidth={2.5} className="text-white transition-transform duration-200 group-hover:rotate-90" />
        </span>
      </button>

      {/* Custom bottom-sheet modal — no title duplication */}
      {mounted && open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={handleClose}
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] transition-all duration-300 ${
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            {/* Header — compact with coin icon */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
                  <LaunchTokenIcon size={40} />
                </div>
                <div>
                  <h2 className="text-sm font-bold">{t('wager.newBet')}</h2>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{t('wager.newBetDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 min-h-0">
              <CreateBetForm
                variant="flat"
                onBetSubmitted={onBetSubmitted}
                controlledAmount={amount}
                onAmountChange={setAmount}
                onSubmitComplete={handleSubmitComplete}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
