'use client';

import { useState, useCallback, useEffect } from 'react';
import { Store, Power, PowerOff, RefreshCw, Loader2, CheckCircle, AlertTriangle, Save, ShoppingBag, Users, Package, Wallet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { CHEST_TIERS } from '@/app/game/shop/chest-config';

type TierConfig = {
  tier: number;
  axmPrice: number;
  coinAmount: number;
};

type ShopStats = {
  totalPurchases: number;
  uniqueBuyers: number;
  totalAxm: string;
  totalCoin: string;
  totalBonus: string;
  perTier: Array<{ tier: number; purchases: number; axmTotal: string }>;
  recent: Array<{
    id: string;
    address: string;
    chestTier: number;
    axmAmount: string;
    coinAmount: string;
    bonusCredited: string;
    txHash: string;
    status: string;
    createdAt: string;
  }>;
};

type AdminConfig = {
  tiers: TierConfig[];
  enabled: boolean;
  treasuryBalance: string;
};

export function ShopTab() {
  const queryClient = useQueryClient();

  // Admin config (tiers + enabled + treasury balance)
  const { data: adminConfig, isLoading: configLoading, refetch: refetchConfig } = useQuery({
    queryKey: ['admin', 'shop-config'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/shop/admin/config`, {
        headers: { ...getAuthHeaders() },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as AdminConfig;
    },
    staleTime: 15_000,
  });

  // Shop stats
  const { data: shopStats, refetch: refetchShopStats } = useQuery({
    queryKey: ['admin', 'shop-stats'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/shop/admin/stats`, {
        headers: { ...getAuthHeaders() },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as ShopStats;
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tier editing
  const [editingTiers, setEditingTiers] = useState<TierConfig[] | null>(null);

  // Initialize editing tiers from server config
  useEffect(() => {
    if (adminConfig?.tiers && !editingTiers) {
      setEditingTiers(adminConfig.tiers);
    }
  }, [adminConfig?.tiers]);

  const isEnabled = adminConfig?.enabled ?? false;
  const treasuryBalance = Number(adminConfig?.treasuryBalance ?? '0') / 1_000_000;

  const fmtMicro = (micro: string) => (Number(micro) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const clearMessages = () => { setError(null); setSuccess(null); };

  const refreshAll = useCallback(() => {
    refetchConfig();
    refetchShopStats();
    queryClient.invalidateQueries({ queryKey: ['shop'] });
  }, [refetchConfig, refetchShopStats, queryClient]);

  const handleToggleEnabled = useCallback(async () => {
    if (loading) return;
    clearMessages();
    setLoading('toggle');
    try {
      const res = await fetch(`${API_URL}/api/v1/shop/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ enabled: !isEnabled }),
      });
      if (!res.ok) throw new Error('Failed to update config');
      setSuccess(isEnabled ? 'Магазин выключен' : 'Магазин включён');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [isEnabled, loading, refreshAll]);

  const handleSaveTiers = useCallback(async () => {
    if (loading || !editingTiers) return;
    clearMessages();
    setLoading('tiers');
    try {
      const res = await fetch(`${API_URL}/api/v1/shop/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ tiers: editingTiers }),
      });
      if (!res.ok) throw new Error('Failed to update tiers');
      setSuccess('Цены обновлены');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [editingTiers, loading, refreshAll]);

  const updateTier = (tier: number, field: 'axmPrice' | 'coinAmount', value: string) => {
    if (!editingTiers) return;
    setEditingTiers(editingTiers.map((t) =>
      t.tier === tier ? { ...t, [field]: parseFloat(value) || 0 } : t,
    ));
  };

  const tierName = (tier: number) => {
    const chest = CHEST_TIERS.find((c) => c.tier === tier);
    return chest ? `T${tier}` : `T${tier}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-lg font-bold">Управление магазином</h2>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium hover:bg-[var(--color-surface-hover)]"
        >
          <RefreshCw size={12} />
          Обновить
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5">
          <AlertTriangle size={14} className="text-[var(--color-danger)] shrink-0" />
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2.5">
          <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
          <p className="text-xs text-[var(--color-success)]">{success}</p>
        </div>
      )}

      {/* ========= STATUS + TREASURY ========= */}
      {configLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Статус</p>
              <p className={`text-sm font-bold ${isEnabled ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                {isEnabled ? 'Активен' : 'Выключен'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-1">
                <Wallet size={10} /> Баланс казны (COIN)
              </p>
              <p className="text-sm font-bold">{treasuryBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Toggle Enable/Disable */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div>
              <p className="text-xs font-medium">Статус магазина</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">
                {isEnabled ? 'Магазин активен и виден пользователям' : 'Магазин выключен и скрыт от пользователей'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleEnabled}
              disabled={!!loading}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                isEnabled
                  ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20'
                  : 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
              } disabled:opacity-50`}
            >
              {loading === 'toggle' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : isEnabled ? (
                <><PowerOff size={12} /> Выключить</>
              ) : (
                <><Power size={12} /> Включить</>
              )}
            </button>
          </div>

          {/* ========= TIER PRICE EDITOR ========= */}
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Package size={14} />
            Цены по тирам
          </h3>

          {editingTiers && (
            <div className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-[10px] text-[var(--color-text-secondary)] px-1">
                <span>Тир</span>
                <span>Цена (AXM)</span>
                <span>COIN за покупку</span>
              </div>
              {editingTiers.map((tier) => (
                <div key={tier.tier} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                  <span className="text-xs font-bold w-8">{tierName(tier.tier)}</span>
                  <input
                    type="number"
                    value={tier.axmPrice}
                    onChange={(e) => updateTier(tier.tier, 'axmPrice', e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    value={tier.coinAmount}
                    onChange={(e) => updateTier(tier.tier, 'coinAmount', e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handleSaveTiers}
                disabled={!!loading}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {loading === 'tiers' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Сохранить цены
              </button>
            </div>
          )}
        </>
      )}

      {/* ========= SHOP PURCHASES STATS ========= */}
      {shopStats && (
        <>
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <ShoppingBag size={14} />
            Статистика покупок
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Всего покупок</p>
              <p className="text-sm font-bold">{shopStats.totalPurchases}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Уник. покупателей</p>
              <p className="text-sm font-bold flex items-center gap-1">
                <Users size={12} /> {shopStats.uniqueBuyers}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">AXM через магазин</p>
              <p className="text-sm font-bold">{fmtMicro(shopStats.totalAxm)}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Бонус выдан</p>
              <p className="text-sm font-bold text-[var(--color-success)]">{fmtMicro(shopStats.totalBonus)} COIN</p>
            </div>
          </div>

          {/* Per-tier breakdown */}
          {shopStats.perTier.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Package size={12} />
                Покупки по уровням
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {CHEST_TIERS.map((chest) => {
                  const tierData = shopStats.perTier.find((t) => t.tier === chest.tier);
                  return (
                    <div key={chest.tier} className="rounded-lg bg-[var(--color-bg)] p-2 text-center">
                      <p className="text-[10px] text-[var(--color-text-secondary)]">T{chest.tier}</p>
                      <p className="text-xs font-bold">{tierData?.purchases ?? 0}</p>
                      <p className="text-[9px] text-[var(--color-text-secondary)]">{fmtMicro(tierData?.axmTotal ?? '0')} AXM</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent purchases */}
          {shopStats.recent.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <p className="text-xs font-medium">Последние покупки</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {shopStats.recent.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-[var(--color-bg)] px-2.5 py-1.5 text-[10px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold shrink-0">T{p.chestTier}</span>
                      <span className="text-[var(--color-text-secondary)] truncate font-mono">{p.address.slice(0, 8)}...{p.address.slice(-4)}</span>
                      <span className={`px-1 rounded text-[8px] font-bold ${
                        p.status === 'confirmed' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                        : p.status === 'failed' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                      }`}>{p.status}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span>{fmtMicro(p.axmAmount)} AXM</span>
                      {p.bonusCredited !== '0' && (
                        <span className="text-[var(--color-success)] font-bold">+{fmtMicro(p.bonusCredited)}</span>
                      )}
                      <span className="text-[var(--color-text-secondary)]">
                        {new Date(p.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
