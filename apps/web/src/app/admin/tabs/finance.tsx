'use client';

import { useState } from 'react';
import { Wallet, Send, Handshake, Store } from 'lucide-react';
import { SubNav } from '../_shared';
import { TreasuryWithdrawSection, TreasurySweepSection, CommissionLedgerSection } from './dashboard';
import { StakingFlushSection, PartnersSection } from './commission';
import { ShopTab } from './shop';

type Sub = 'treasury' | 'staking' | 'partners' | 'shop';

const SUBS = [
  { id: 'treasury' as const, icon: Wallet, label: 'Казна' },
  { id: 'staking' as const, icon: Send, label: 'Стейкинг' },
  { id: 'partners' as const, icon: Handshake, label: 'Партнёры' },
  { id: 'shop' as const, icon: Store, label: 'Магазин' },
] as const;

export function FinanceTab() {
  const [sub, setSub] = useState<Sub>('treasury');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'treasury' && (
        <div className="space-y-6">
          <TreasuryWithdrawSection />
          <TreasurySweepSection />
          <CommissionLedgerSection />
        </div>
      )}
      {sub === 'staking' && <StakingFlushSection />}
      {sub === 'partners' && <PartnersSection />}
      {sub === 'shop' && <ShopTab />}
    </div>
  );
}
