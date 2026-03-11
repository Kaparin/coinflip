'use client';

import { useState } from 'react';
import { Activity, Wrench, ArrowLeftRight } from 'lucide-react';
import { SubNav } from '../_shared';
import { DiagnosticsTab } from './diagnostics';
import { ActionsTab } from './actions';
import { TransactionsTab } from './transactions';

type Sub = 'diagnostics' | 'actions' | 'transactions';

const SUBS = [
  { id: 'diagnostics' as const, icon: Activity, label: 'Диагностика' },
  { id: 'actions' as const, icon: Wrench, label: 'Действия' },
  { id: 'transactions' as const, icon: ArrowLeftRight, label: 'Транзакции' },
] as const;

export function SystemTab() {
  const [sub, setSub] = useState<Sub>('diagnostics');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'diagnostics' && <DiagnosticsTab />}
      {sub === 'actions' && <ActionsTab />}
      {sub === 'transactions' && <TransactionsTab />}
    </div>
  );
}
