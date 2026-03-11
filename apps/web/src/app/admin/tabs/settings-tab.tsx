'use client';

import { useState } from 'react';
import { Settings, Crown, GitBranch } from 'lucide-react';
import { SubNav } from '../_shared';
import { ConfigTab } from './config';
import { VipTab } from './vip';
import { ReferralConfigSection } from './commission';

type Sub = 'config' | 'vip' | 'referrals';

const SUBS = [
  { id: 'config' as const, icon: Settings, label: 'Конфигурация' },
  { id: 'vip' as const, icon: Crown, label: 'VIP' },
  { id: 'referrals' as const, icon: GitBranch, label: 'Рефералы' },
] as const;

export function SettingsTab() {
  const [sub, setSub] = useState<Sub>('config');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'config' && <ConfigTab />}
      {sub === 'vip' && <VipTab />}
      {sub === 'referrals' && <ReferralConfigSection />}
    </div>
  );
}
