'use client';

import { useState } from 'react';
import { useJoinEvent } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { feedback } from '@/lib/feedback';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Sparkles } from 'lucide-react';

interface JoinRaffleButtonProps {
  eventId: string;
  hasJoined?: boolean;
  eventType: string;
  eventStatus: string;
}

/** Extract error message from API response or generic error */
function extractErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  // customFetch throws { error: { code, message } }
  const apiError = (err as { error?: { message?: string } }).error;
  if (apiError?.message) return apiError.message;
  // fallback: top-level message
  return (err as { message?: string }).message;
}

export function JoinRaffleButton({ eventId, hasJoined, eventType, eventStatus }: JoinRaffleButtonProps) {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [justJoined, setJustJoined] = useState(false);

  const { mutate: join, isPending } = useJoinEvent({
    mutation: {
      onSuccess: () => {
        setError(null);
        setJustJoined(true);
        // Invalidate all event-related queries (query keys are full URL paths)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.startsWith('/api/v1/events');
          },
        });
        // Invalidate balance cache — joining a raffle may deduct entry fee
        queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
      },
      onError: (err: unknown) => {
        const msg = extractErrorMessage(err) ?? t('errors.somethingWentWrong');
        setError(msg);
      },
    },
  });

  if (!isConnected) return null;
  if (eventStatus !== 'active' && eventStatus !== 'draft') return null;

  // For auto-join contests, no button needed
  if (eventType === 'contest') return null;

  if (hasJoined || justJoined) {
    return (
      <div className="animate-bounce-in flex items-center justify-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2 text-sm font-bold text-[var(--color-success)]">
        <CheckCircle size={16} />
        {t('events.alreadyJoined')}
        <Sparkles size={14} className="opacity-60" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => { feedback('tap'); join({ eventId }); }}
        disabled={isPending}
        className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-3 text-sm font-bold text-black transition-all hover:from-amber-400 hover:to-yellow-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:opacity-50 active:scale-[0.98]"
      >
        {/* Shimmer overlay on button */}
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <span className="relative">
          {isPending ? t('common.processing') : t('events.joinRaffle')}
        </span>
      </button>
      {error && <p className="text-xs text-[var(--color-danger)] text-center">{error}</p>}
    </div>
  );
}
