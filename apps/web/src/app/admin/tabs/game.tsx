'use client';

import { useState } from 'react';
import { Dices, Trophy, Gem } from 'lucide-react';
import { SubNav } from '../_shared';
import { BetsTab } from './bets';
import { EventsTab } from './events';
import { JackpotTab } from './jackpot';

type Sub = 'bets' | 'events' | 'jackpot';

const SUBS = [
  { id: 'bets' as const, icon: Dices, label: 'Ставки' },
  { id: 'events' as const, icon: Trophy, label: 'Ивенты' },
  { id: 'jackpot' as const, icon: Gem, label: 'Джекпот' },
] as const;

export function GameTab() {
  const [sub, setSub] = useState<Sub>('bets');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'bets' && <BetsTab />}
      {sub === 'events' && <EventsTab />}
      {sub === 'jackpot' && <JackpotTab />}
    </div>
  );
}
