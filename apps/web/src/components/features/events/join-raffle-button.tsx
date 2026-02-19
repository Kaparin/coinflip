'use client';

import { useState } from 'react';
import { useJoinEvent } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';

interface JoinRaffleButtonProps {
  eventId: string;
  hasJoined?: boolean;
  eventType: string;
  eventStatus: string;
}

export function JoinRaffleButton({ eventId, hasJoined, eventType, eventStatus }: JoinRaffleButtonProps) {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { mutate: join, isPending } = useJoinEvent({
    mutation: {
      onSuccess: () => {
        setError(null);
        queryClient.invalidateQueries({ queryKey: ['/api/v1/events'] });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? t('errors.somethingWentWrong');
        setError(msg);
      },
    },
  });

  if (!isConnected) return null;
  if (eventStatus !== 'active') return null;

  // For auto-join contests, no button needed
  if (eventType === 'contest') return null;

  if (hasJoined) {
    return (
      <div className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2 text-center text-sm font-bold text-[var(--color-success)]">
        {t('events.alreadyJoined')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => join({ eventId })}
        disabled={isPending}
        className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
      >
        {isPending ? t('common.processing') : t('events.joinRaffle')}
      </button>
      {error && <p className="text-xs text-[var(--color-danger)] text-center">{error}</p>}
    </div>
  );
}
