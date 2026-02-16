'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useTranslation } from '@/lib/i18n';
import { API_URL } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { signAuthzGrant } from '@/lib/wallet-signer';
import { CheckCircle, Loader2, Shield } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Onboarding modal for setting up Authz grant.
 * Uses the web wallet to sign the grant transaction client-side.
 */
type AuthStep = 'fetching' | 'signing' | 'broadcasting' | 'confirming';

const AUTH_STEPS: AuthStep[] = ['fetching', 'signing', 'broadcasting', 'confirming'];

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { t } = useTranslation();
  const { address, getWallet } = useWalletContext();
  const { data: grantStatus, refetch } = useGrantStatus();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'explain' | 'signing' | 'done'>('explain');
  const [authStep, setAuthStep] = useState<AuthStep>('fetching');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time counter
  useEffect(() => {
    if (step === 'signing') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const handleGrantAuthz = useCallback(async () => {
    if (!address) return;

    const wallet = getWallet();
    if (!wallet) {
      setError('Wallet not unlocked. Please reconnect.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setAuthStep('fetching');
    setStep('signing');

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/grant-msg`, {
        headers: { 'x-wallet-address': address },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch grant parameters');
      const { data: grantParams } = await res.json();

      setAuthStep('signing');
      await new Promise((r) => setTimeout(r, 300));
      setAuthStep('broadcasting');

      await signAuthzGrant(wallet, address, grantParams.grantee);

      setAuthStep('confirming');
      await new Promise((r) => setTimeout(r, 800));

      setStep('done');
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

  const authStepLabels: Record<AuthStep, string> = {
    fetching: t('onboarding.authStep1'),
    signing: t('onboarding.authStep2'),
    broadcasting: t('onboarding.authStep3'),
    confirming: t('onboarding.authStep4'),
  };
  const currentAuthIdx = AUTH_STEPS.indexOf(authStep);

  return (
    <Modal open={isOpen} onClose={step === 'signing' ? () => {} : onClose}>
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
                  <CheckCircle size={16} className="text-[var(--color-success)] mt-0.5 shrink-0" />
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
          <div className="py-2 space-y-5">
            {/* Spinner */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin" />
                <Shield size={20} className="text-[var(--color-primary)]" />
              </div>
              <h3 className="text-base font-bold">{t('onboarding.authInProgress')}</h3>
            </div>

            {/* Steps */}
            <div className="space-y-2.5">
              {AUTH_STEPS.map((s, idx) => {
                const isActive = idx === currentAuthIdx;
                const isDone = idx < currentAuthIdx;

                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                      isDone ? 'bg-[var(--color-success)] text-white'
                        : isActive ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-border)]/30 text-[var(--color-text-secondary)]'
                    }`}>
                      {isDone ? (
                        <CheckCircle size={14} />
                      ) : isActive ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className={`text-sm transition-colors duration-300 ${
                      isDone ? 'text-[var(--color-success)] font-medium'
                        : isActive ? 'text-[var(--color-text)] font-semibold'
                        : 'text-[var(--color-text-secondary)]'
                    }`}>
                      {authStepLabels[s]}
                      {isActive && <span className="inline-block ml-1 animate-pulse">...</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Warning */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <Shield size={14} className="text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t('onboarding.authDoNotClose')}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[var(--color-text-secondary)]">
                  {t('onboarding.authEstimate')} · {elapsed}s
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <CheckCircle size={32} className="text-[var(--color-success)]" />
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
