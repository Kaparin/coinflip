'use client';

import { useState } from 'react';
import { Dices, Trophy, Gem, Swords } from 'lucide-react';
import { SubNav } from '../_shared';
import { BetsTab } from './bets';
import { EventsTab } from './events';
import { JackpotTab } from './jackpot';
import { TournamentsAdminTab } from './tournaments';

type Sub = 'bets' | 'events' | 'jackpot' | 'tournaments';

const SUBS = [
  { id: 'bets' as const, icon: Dices, label: 'Ставки' },
  { id: 'events' as const, icon: Trophy, label: 'Ивенты' },
  { id: 'tournaments' as const, icon: Swords, label: 'Турниры' },
  { id: 'jackpot' as const, icon: Gem, label: 'Джекпот' },
] as const;

export function GameTab() {
  const [sub, setSub] = useState<Sub>('bets');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'bets' && <BetsTab />}
      {sub === 'events' && <EventsTab />}
      {sub === 'tournaments' && <TournamentsAdminTab />}
      {sub === 'jackpot' && <JackpotTab />}
    </div>
  );
}
