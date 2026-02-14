'use client';

import { useState, useMemo } from 'react';
import { useGetBets, useAcceptBet, type Bet } from '@coinflip/api-client';
import { BetCard } from './bet-card';
import { Skeleton } from '@/components/ui/skeleton';

type AmountFilter = 'all' | 'low' | 'mid' | 'high';

const AMOUNT_FILTERS: { value: AmountFilter; label: string; min: number; max: number }[] = [
  { value: 'all', label: 'All', min: 0, max: Infinity },
  { value: 'low', label: '10–99', min: 10, max: 99 },
  { value: 'mid', label: '100–499', min: 100, max: 499 },
  { value: 'high', label: '500+', min: 500, max: Infinity },
];

export function BetList() {
  const [amountFilter, setAmountFilter] = useState<AmountFilter>('all');

  const { data, isLoading, error } = useGetBets({ status: 'open', limit: 50 });
  const acceptMutation = useAcceptBet();

  const bets = data?.data ?? [];

  const filteredBets = useMemo(() => {
    const range = AMOUNT_FILTERS.find((f) => f.value === amountFilter)!;
    return bets.filter((bet) => {
      const amount = Number(bet.amount);
      return amount >= range.min && amount <= range.max;
    });
  }, [bets, amountFilter]);

  const handleAccept = (id: string) => {
    acceptMutation.mutate(
      { betId: Number(id), data: { guess: 'heads' as const } },
      {
        onSuccess: () => {
          console.log('Bet accepted:', id);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-danger)] py-16">
        <span className="text-4xl">⚠️</span>
        <p className="text-lg font-medium text-[var(--color-danger)]">
          Failed to load bets
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Make sure the API server is running on port 3001
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5">
          {AMOUNT_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setAmountFilter(filter.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                amountFilter === filter.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bet Grid */}
      {filteredBets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBets.map((bet) => (
            <BetCard
              key={bet.id}
              id={String(bet.id)}
              maker={bet.maker}
              amount={Number(bet.amount)}
              side={bet.acceptor_guess === 'tails' ? 'tails' : 'heads'}
              createdAt={new Date(bet.created_at)}
              revealDeadline={bet.reveal_deadline ? new Date(bet.reveal_deadline) : undefined}
              canAccept={bet.status === 'open'}
              onAccept={handleAccept}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] py-16">
          <span className="text-4xl">🎲</span>
          <p className="text-lg font-medium text-[var(--color-text-secondary)]">
            No open bets
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]/70">
            Be the first to create one!
          </p>
        </div>
      )}
    </div>
  );
}
