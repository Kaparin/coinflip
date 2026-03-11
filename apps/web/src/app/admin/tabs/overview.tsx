'use client';

import { DashboardAnalytics } from './dashboard';
import { CommissionBreakdownSection } from './commission';

export function OverviewTab() {
  return (
    <div className="space-y-8">
      <DashboardAnalytics />
      <CommissionBreakdownSection />
    </div>
  );
}
