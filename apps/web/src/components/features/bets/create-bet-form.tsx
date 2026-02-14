'use client';

import { useState, useCallback } from 'react';
import { useCreateBet } from '@coinflip/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCommitment } from '@/hooks/use-commitment';
import { useWallet } from '@/hooks/use-wallet';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500, 1000] as const;

type Side = 'heads' | 'tails';

export function CreateBetForm() {
  const [amount, setAmount] = useState<string>('');
  const [side, setSide] = useState<Side>('heads');
  const { address } = useWallet();
  const { secret, commitment, generate: generateCommitment } = useCommitment();

  const queryClient = useQueryClient();
  const createBet = useCreateBet({
    mutation: {
      onSuccess: () => {
        // Invalidate bets list to refresh
        queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
      },
    },
  });

  const parsedAmount = Number(amount);
  const isValidAmount = parsedAmount >= 10 && Number.isFinite(parsedAmount);

  const handlePresetClick = useCallback((preset: number) => {
    setAmount(String(preset));
  }, []);

  const handleCustomAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/[^0-9.]/g, '');
      setAmount(value);
    },
    [],
  );

  const handleCreateBet = useCallback(async () => {
    if (!isValidAmount || !address) return;

    // Generate commitment using proper Axiome formula:
    // SHA256("coinflip_v1" || maker_address || side || secret)
    await generateCommitment(address, side);
  }, [isValidAmount, address, side, generateCommitment]);

  // When commitment is ready, submit the bet
  const handleSubmitBet = useCallback(() => {
    if (!commitment) return;

    createBet.mutate({
      data: {
        amount: String(parsedAmount),
        commitment,
      },
    });
  }, [commitment, parsedAmount, createBet]);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-6 text-xl font-bold">Create a Bet</h2>

      {/* Side Toggle */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
          Pick your side
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSide('heads')}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-all ${
              side === 'heads'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)]'
            }`}
          >
            <span className="text-3xl">👑</span>
            Heads
          </button>
          <button
            type="button"
            onClick={() => setSide('tails')}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-semibold transition-all ${
              side === 'tails'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)]'
            }`}
          >
            <span className="text-3xl">🪙</span>
            Tails
          </button>
        </div>
      </div>

      {/* Amount Presets */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
          Wager amount (LAUNCH)
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_AMOUNTS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetClick(preset)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                amount === String(preset)
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              }`}
            >
              {preset.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Custom amount..."
            value={amount}
            onChange={handleCustomAmountChange}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 pr-20 text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)]/50 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--color-text-secondary)]">
            LAUNCH
          </span>
        </div>
        {amount !== '' && !isValidAmount && (
          <p className="mt-1.5 text-xs text-[var(--color-danger)]">
            Minimum bet is 10 LAUNCH
          </p>
        )}
      </div>

      {/* Create Button */}
      {!commitment ? (
        <button
          type="button"
          disabled={!isValidAmount || !address}
          onClick={handleCreateBet}
          className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!address
            ? 'Connect wallet first'
            : `Flip for ${isValidAmount ? Number(parsedAmount).toLocaleString() : '—'} LAUNCH`}
        </button>
      ) : (
        <button
          type="button"
          disabled={createBet.isPending}
          onClick={handleSubmitBet}
          className="w-full rounded-xl bg-[var(--color-success)] px-6 py-3.5 text-base font-bold transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {createBet.isPending ? 'Submitting...' : 'Confirm & Submit Bet'}
        </button>
      )}

      {/* Error display */}
      {createBet.isError && (
        <div className="mt-4 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-4">
          <p className="text-sm text-[var(--color-danger)]">
            Failed to create bet. Please try again.
          </p>
        </div>
      )}

      {/* Commitment Info (shown after creation) */}
      {commitment && secret && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-warning)]">
            Save your secret — you will need it to reveal!
          </p>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-[var(--color-text-secondary)]">Commitment:</span>
              <p className="mt-0.5 break-all font-mono text-xs text-[var(--color-text)]">
                {commitment}
              </p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-text-secondary)]">Secret (keep private!):</span>
              <p className="mt-0.5 break-all font-mono text-xs text-[var(--color-danger)]">
                {secret}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
