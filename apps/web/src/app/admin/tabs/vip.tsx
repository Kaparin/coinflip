'use client';

import { useState, useEffect } from 'react';
import { Crown, Settings } from 'lucide-react';
import { formatLaunch, fromMicroLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { useAdminVipStats, useAdminVipSubscribers, useAdminGrantVip, useAdminRevokeVip, useAdminUpdateVipConfig } from '@/hooks/use-admin';
import { useVipConfig } from '@/hooks/use-vip';
import { StatCard, TableWrapper, ActionButton, shortAddr, timeAgo } from '../_shared';
import { VipBadge } from '@/components/ui/vip-badge';

function TierConfigRow({ tier, price, isActive }: { tier: string; price: string; isActive: boolean }) {
  const [editPrice, setEditPrice] = useState(() => fromMicroLaunch(Number(price)).toString());
  const [active, setActive] = useState(isActive);
  const updateMutation = useAdminUpdateVipConfig();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEditPrice(fromMicroLaunch(Number(price)).toString());
    setActive(isActive);
  }, [price, isActive]);

  const hasChanges = editPrice !== fromMicroLaunch(Number(price)).toString() || active !== isActive;

  const handleSave = async () => {
    const microPrice = toMicroLaunch(Number(editPrice)).toString();
    await updateMutation.mutateAsync({ tier, price: microPrice, isActive: active });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <tr className="border-b border-[var(--color-border)]/30">
      <td className="py-3">
        <VipBadge tier={tier} size="md" showLabel />
      </td>
      <td className="py-3">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            min={0}
            step={10}
            className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm tabular-nums focus:border-[var(--color-primary)] focus:outline-none"
          />
          <span className="text-xs text-[var(--color-text-secondary)]">COIN</span>
        </div>
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={() => setActive(!active)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            active ? 'bg-emerald-500' : 'bg-zinc-600'
          }`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            active ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          <ActionButton
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}

export function VipTab() {
  const [page, setPage] = useState(0);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTier, setGrantTier] = useState('gold');
  const [grantDays, setGrantDays] = useState(30);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const { data: stats } = useAdminVipStats();
  const { data: subsData } = useAdminVipSubscribers(page);
  const { data: vipTiers } = useVipConfig();
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
        <StatCard label="Total Revenue" value={stats ? formatLaunch(stats.total_revenue) : '0'} sub="COIN" />
        <StatCard label="This Week" value={stats ? formatLaunch(stats.week_revenue) : '0'} sub="COIN" />
      </div>

      {/* Tier Config */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} className="text-[var(--color-text-secondary)]" />
          <h3 className="text-sm font-bold">Tier Pricing</h3>
        </div>
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                <th className="py-2 text-left font-medium px-3">Tier</th>
                <th className="py-2 text-left font-medium">Price / month</th>
                <th className="py-2 text-left font-medium">Active</th>
                <th className="py-2 text-right font-medium px-3" />
              </tr>
            </thead>
            <tbody>
              {vipTiers?.map((t) => (
                <TierConfigRow
                  key={t.tier}
                  tier={t.tier}
                  price={t.price}
                  isActive={t.isActive}
                />
              ))}
              {!vipTiers?.length && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-[var(--color-text-secondary)]">
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrapper>
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
