'use client';

import { useState, useCallback } from 'react';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500, 1000] as const;

type Side = 'heads' | 'tails';

async function generateCommitment(side: Side, secret: string): Promise<string> {
  const message = `${side}:${secret}`;
  const encoded = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function CreateBetForm() {
  const [amount, setAmount] = useState<string>('');
  const [side, setSide] = useState<Side>('heads');
  const [isCreating, setIsCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);

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
    if (!isValidAmount) return;

    setIsCreating(true);
    try {
      const newSecret = generateSecret();
      const newCommitment = await generateCommitment(side, newSecret);

      setSecret(newSecret);
      setCommitment(newCommitment);

      // TODO: Send to API — for now just log
      console.log('Bet created:', {
        amount: parsedAmount,
        side,
        commitment: newCommitment,
        secret: newSecret,
      });
    } finally {
      setIsCreating(false);
    }
  }, [isValidAmount, parsedAmount, side]);

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
      <button
        type="button"
        disabled={!isValidAmount || isCreating}
        onClick={handleCreateBet}
        className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isCreating ? 'Creating...' : `Flip for ${isValidAmount ? Number(parsedAmount).toLocaleString() : '—'} LAUNCH`}
      </button>

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
