'use client';

import { useState, useMemo } from 'react';
import { BetCard, type BetCardProps } from './bet-card';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_BETS: BetCardProps[] = [
  {
    id: '1',
    maker: 'axiome1qz3f5xr7yn0d5kwmjx9m4yehsqq72rch3mqdv',
    amount: 100,
    side: 'heads',
    createdAt: new Date(Date.now() - 2 * 60_000),
  },
  {
    id: '2',
    maker: 'axiome1v4e5cc4hpf5rgzc3d8ntg0k7t3hrwlmfkaqdzv',
    amount: 50,
    side: 'tails',
    createdAt: new Date(Date.now() - 8 * 60_000),
  },
  {
    id: '3',
    maker: 'axiome1pjf0s2klwgyqe9rdcwxn20g3kzq5au6yaxtxya',
    amount: 1000,
    side: 'heads',
    createdAt: new Date(Date.now() - 15 * 60_000),
  },
  {
    id: '4',
    maker: 'axiome1mk8933ds3fh8a5v9pmnnzrq4jlh73jw4nr9c8v',
    amount: 250,
    side: 'tails',
    createdAt: new Date(Date.now() - 22 * 60_000),
  },
  {
    id: '5',
    maker: 'axiome1t6aqvnf0aqze7xqvxr2gxksc4c9rjw2kylnz6m',
    amount: 25,
    side: 'heads',
    createdAt: new Date(Date.now() - 45 * 60_000),
  },
  {
    id: '6',
    maker: 'axiome1dxe2n8gq3rv74hxs3yz3mnnqafkr8c7v5qf2wz',
    amount: 500,
    side: 'tails',
    createdAt: new Date(Date.now() - 60 * 60_000),
    revealDeadline: new Date(Date.now() + 3 * 60_000),
  },
];

const MOCK_USER_BALANCE = 420;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type AmountFilter = 'all' | 'low' | 'mid' | 'high';

const AMOUNT_FILTERS: { value: AmountFilter; label: string; min: number; max: number }[] = [
  { value: 'all', label: 'All', min: 0, max: Infinity },
  { value: 'low', label: '10–99', min: 10, max: 99 },
  { value: 'mid', label: '100–499', min: 100, max: 499 },
  { value: 'high', label: '500+', min: 500, max: Infinity },
];

export function BetList() {
  const [amountFilter, setAmountFilter] = useState<AmountFilter>('all');
  const [onlyAffordable, setOnlyAffordable] = useState(false);

  const filteredBets = useMemo(() => {
    const range = AMOUNT_FILTERS.find((f) => f.value === amountFilter)!;
    return MOCK_BETS.filter((bet) => {
      if (bet.amount < range.min || bet.amount > range.max) return false;
      if (onlyAffordable && bet.amount > MOCK_USER_BALANCE) return false;
      return true;
    });
  }, [amountFilter, onlyAffordable]);

  const handleAccept = (id: string) => {
    console.log('Accept bet:', id);
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Amount range */}
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

        {/* Affordable toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <button
            type="button"
            role="switch"
            aria-checked={onlyAffordable}
            onClick={() => setOnlyAffordable((prev) => !prev)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              onlyAffordable ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                onlyAffordable ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          Only bets I can cover
        </label>
      </div>

      {/* Bet Grid */}
      {filteredBets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBets.map((bet) => (
            <BetCard
              key={bet.id}
              {...bet}
              canAccept={bet.amount <= MOCK_USER_BALANCE && !bet.revealDeadline}
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
