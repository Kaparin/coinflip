'use client';

import { useState } from 'react';
import { Megaphone, Newspaper } from 'lucide-react';
import { SubNav } from '../_shared';
import { AnnouncementsTab } from './announcements';
import { NewsTab } from './news';

type Sub = 'announcements' | 'news';

const SUBS = [
  { id: 'announcements' as const, icon: Megaphone, label: 'Анонсы' },
  { id: 'news' as const, icon: Newspaper, label: 'Новости' },
] as const;

export function ContentTab() {
  const [sub, setSub] = useState<Sub>('announcements');

  return (
    <div>
      <SubNav items={SUBS} active={sub} onChange={setSub} />
      {sub === 'announcements' && <AnnouncementsTab />}
      {sub === 'news' && <NewsTab />}
    </div>
  );
}
