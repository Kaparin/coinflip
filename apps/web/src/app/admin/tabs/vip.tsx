'use client';

import { useState } from 'react';
import { Crown } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { useAdminVipStats, useAdminVipSubscribers, useAdminGrantVip, useAdminRevokeVip } from '@/hooks/use-admin';
import { StatCard, TableWrapper, ActionButton, shortAddr, timeAgo } from '../_shared';
import { VipBadge } from '@/components/ui/vip-badge';

export function VipTab() {
  const [page, setPage] = useState(0);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTier, setGrantTier] = useState('gold');
  const [grantDays, setGrantDays] = useState(30);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const { data: stats } = useAdminVipStats();
  const { data: subsData } = useAdminVipSubscribers(page);
  const grantMutation = useAdminGrantVip();
  const revokeMutation = useAdminRevokeVip();

  const subscribers = subsData?.data ?? [];

  const handleGrant = async () => {
    if (!grantUserId.trim()) return;
    setActionResult(null);
    try {
      const result = await grantMutation.mutateAsync({ userId: grantUserId.trim(), tier: grantTier, days: grantDays });
      setActionResult(result.message);
      setGrantUserId('');
    } catch (err: any) {
      setActionResult(`Error: ${err.message}`);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      const result = await revokeMutation.mutateAsync(userId);
      setActionResult(result.message);
    } catch (err: any) {
      setActionResult(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active VIPs" value={stats?.active_count ?? 0} />
        <StatCard label="Silver" value={stats?.silver_count ?? 0} />
        <StatCard label="Gold" value={stats?.gold_count ?? 0} />
        <StatCard label="Diamond" value={stats?.diamond_count ?? 0} />
        <StatCard label="Total Revenue" value={stats ? formatLaunch(stats.total_revenue) : '0'} sub="LAUNCH" />
        <StatCard label="This Week" value={stats ? formatLaunch(stats.week_revenue) : '0'} sub="LAUNCH" />
      </div>

      {/* Grant VIP */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Crown size={18} className="text-amber-400" />
          <h3 className="text-sm font-bold">Grant VIP</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={grantUserId}
            onChange={(e) => setGrantUserId(e.target.value)}
            placeholder="User ID (UUID)"
            className="flex-1 min-w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <select
            value={grantTier}
            onChange={(e) => setGrantTier(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          >
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="diamond">Diamond</option>
          </select>
          <input
            type="number"
            value={grantDays}
            onChange={(e) => setGrantDays(Number(e.target.value))}
            min={1}
            max={365}
            className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <ActionButton onClick={handleGrant} disabled={!grantUserId.trim() || grantMutation.isPending}>
            {grantMutation.isPending ? 'Granting...' : 'Grant'}
          </ActionButton>
        </div>
        {actionResult && (
          <p className="text-xs text-[var(--color-text-secondary)]">{actionResult}</p>
        )}
      </div>

      {/* Subscribers Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="text-sm font-bold mb-4">Active Subscribers</h3>
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                <th className="py-2 text-left font-medium">User</th>
                <th className="py-2 text-left font-medium">Tier</th>
                <th className="py-2 text-left font-medium">Paid</th>
                <th className="py-2 text-left font-medium">Expires</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id} className="border-b border-[var(--color-border)]/30">
                  <td className="py-2">
                    <span className="font-mono">{sub.nickname || shortAddr(sub.address)}</span>
                  </td>
                  <td className="py-2">
                    <VipBadge tier={sub.tier} size="sm" showLabel />
                  </td>
                  <td className="py-2">{formatLaunch(sub.pricePaid)}</td>
                  <td className="py-2">{timeAgo(sub.expiresAt)}</td>
                  <td className="py-2 text-right">
                    <ActionButton
                      onClick={() => handleRevoke(sub.userId)}
                      disabled={revokeMutation.isPending}
                      variant="danger"
                    >
                      Revoke
                    </ActionButton>
                  </td>
                </tr>
              ))}
              {subscribers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-[var(--color-text-secondary)]">
                    No active VIP subscribers
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </div>
    </div>
  );
}
