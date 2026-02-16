'use client';

import { useState, useCallback } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useTranslation } from '@/lib/i18n';
import { API_URL } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { signAuthzGrant } from '@/lib/wallet-signer';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Onboarding modal for setting up Authz grant.
 * Uses the web wallet to sign the grant transaction client-side.
 */
export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { t } = useTranslation();
  const { address, getWallet } = useWalletContext();
  const { data: grantStatus, refetch } = useGrantStatus();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'explain' | 'signing' | 'done'>('explain');

  const handleGrantAuthz = useCallback(async () => {
    if (!address) return;

    const wallet = getWallet();
    if (!wallet) {
      setError('Wallet not unlocked. Please reconnect.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStep('signing');

    try {
      // Fetch grant parameters from backend (to get the grantee/relayer address)
      const res = await fetch(`${API_URL}/api/v1/auth/grant-msg`, {
        headers: { 'x-wallet-address': address },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch grant parameters');
      const { data: grantParams } = await res.json();

      // Sign and broadcast the Authz grant using web wallet
      await signAuthzGrant(wallet, address, grantParams.grantee);

      setStep('done');

      // Refetch grant status after a short delay
      setTimeout(() => void refetch(), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign grant';
      setError(msg);
      setStep('explain');
    } finally {
      setIsSubmitting(false);
    }
  }, [address, getWallet, refetch]);

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="p-6 max-w-md">
        {step === 'explain' && (
          <>
            <h2 className="text-xl font-bold mb-3">{t('onboarding.enableTitle')}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {t('onboarding.enableDesc')}
            </p>
            <div className="rounded-xl bg-[var(--color-bg)] p-4 mb-4 space-y-2">
              {[
                t('onboarding.onlyContract'),
                t('onboarding.limitedActions'),
                t('onboarding.expires30d'),
                t('onboarding.signedLocally'),
              ].map((text) => (
                <div key={text} className="flex items-start gap-2">
                  <span className="text-[var(--color-success)] mt-0.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span className="text-xs">{text}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3">
                <p className="text-xs text-[var(--color-danger)]">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} className="flex-1">{t('onboarding.later')}</Button>
              <Button onClick={handleGrantAuthz} loading={isSubmitting} className="flex-1">{t('onboarding.authorize')}</Button>
            </div>
          </>
        )}

        {step === 'signing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
            <p className="text-sm font-medium">{t('onboarding.signingTx')}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('onboarding.broadcastingAuth')}
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <svg className="h-8 w-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-bold">{t('onboarding.allSet')}</p>
            <p className="text-sm text-[var(--color-text-secondary)] text-center">
              {t('onboarding.allSetDesc')}
            </p>
            <Button onClick={onClose} className="mt-2">{t('onboarding.startPlaying')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
