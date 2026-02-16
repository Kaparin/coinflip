'use client';

import { Header } from '@/components/layout/header';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { ADMIN_ADDRESS } from '@/lib/constants';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting, connect } = useWalletContext();
  const { t } = useTranslation();

  const isAdmin =
    isConnected &&
    !!address &&
    !!ADMIN_ADDRESS &&
    address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {isAdmin ? (
          children
        ) : isConnecting ? (
          /* Show loading state while wallet is being restored from session */
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
            <div className="h-10 w-10 rounded-full border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin" />
            <p className="text-sm text-[var(--color-text-secondary)]">{t('admin.restoringSession')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-danger)]/15">
              <svg className="h-8 w-8 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">{t('admin.accessDenied')}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-sm">
              {!isConnected
                ? t('admin.connectForAdmin')
                : t('admin.noAdminPrivileges')}
            </p>
            {!isConnected && (
              <button
                type="button"
                onClick={connect}
                className="mt-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold"
              >
                {t('common.connectWallet')}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
