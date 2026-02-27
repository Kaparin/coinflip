'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, AlertTriangle, Save, Loader2 } from 'lucide-react';
import {
  useAdminConfig,
  useAdminBulkUpdateConfig,
  useAdminToggleMaintenance,
  type ConfigEntry,
} from '@/hooks/use-admin';
import { ActionButton } from '../_shared';
import { LAUNCH_MULTIPLIER } from '@coinflip/shared/constants';

/**
 * Keys whose values are stored as micro-LAUNCH (6 decimals).
 * The UI shows human-readable LAUNCH and converts back on save.
 */
const MICRO_LAUNCH_KEYS = new Set([
  'MIN_BET_AMOUNT',
  'MAX_DAILY_AMOUNT',
  'PIN_MIN_PRICE',
  'BIG_WIN_THRESHOLD',
  'SPONSORED_PRICE',
]);

/** Convert micro string to human-readable LAUNCH number string */
function microToHuman(micro: string): string {
  const n = Number(micro);
  if (Number.isNaN(n)) return micro;
  return String(n / LAUNCH_MULTIPLIER);
}

/** Convert human LAUNCH number string back to micro string */
function humanToMicro(human: string): string {
  const n = Number(human);
  if (Number.isNaN(n)) return human;
  return String(Math.round(n * LAUNCH_MULTIPLIER));
}

const CATEGORY_ORDER = ['game', 'display', 'commission', 'sponsored', 'maintenance', 'general'];
const CATEGORY_LABELS: Record<string, string> = {
  game: 'Game Settings',
  display: 'Display Settings',
  commission: 'Commission',
  sponsored: 'Sponsored Announcements',
  maintenance: 'Maintenance',
  general: 'General',
};

/** Human-readable labels for config keys */
const KEY_LABELS: Record<string, string> = {
  OPEN_BET_TTL_SECS: 'Open Bet TTL (seconds)',
  REVEAL_TIMEOUT_SECS: 'Reveal Timeout (seconds)',
  MIN_BET_AMOUNT: 'Min Bet (COIN)',
  MAX_DAILY_AMOUNT: 'Max Daily Volume (COIN)',
  MAX_OPEN_BETS_PER_USER: 'Max Open Bets Per User',
  MAX_BATCH_SIZE: 'Max Batch Size',
  BET_PRESETS: 'Bet Presets (COIN)',
  LEADERBOARD_CACHE_TTL_MS: 'Leaderboard Cache TTL (ms)',
  PIN_SLOTS: 'Pin Slots',
  PIN_MIN_PRICE: 'Pin Min Price (COIN)',
  PIN_OUTBID_MULTIPLIER: 'Pin Outbid Multiplier',
  BIG_WIN_THRESHOLD: 'Big Win Threshold (COIN)',
  MAINTENANCE_MODE: 'Maintenance Mode',
  MAINTENANCE_MESSAGE: 'Maintenance Message',
  SPONSORED_PRICE: 'Sponsored Price (COIN)',
  SPONSORED_IS_ACTIVE: 'Sponsored Active',
  SPONSORED_MIN_DELAY_MIN: 'Min Delay (minutes)',
  SPONSORED_MAX_TITLE: 'Max Title Length',
  SPONSORED_MAX_MESSAGE: 'Max Message Length',
  COMMISSION_BPS: 'Commission (BPS)',
  REFERRAL_BPS_LEVEL_1: 'Referral L1 (BPS)',
  REFERRAL_BPS_LEVEL_2: 'Referral L2 (BPS)',
  REFERRAL_BPS_LEVEL_3: 'Referral L3 (BPS)',
  MAX_REFERRAL_BPS_PER_BET: 'Max Referral Cap (BPS)',
  JACKPOT_TOTAL_BPS: 'Jackpot (BPS)',
};

export function ConfigTab() {
  const { data: configs, isLoading } = useAdminConfig();
  const bulkUpdate = useAdminBulkUpdateConfig();
  const toggleMaintenance = useAdminToggleMaintenance();

  // Local editable state — stores display values (human-readable for LAUNCH keys)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saveResult, setSaveResult] = useState<string | null>(null);

  // Group by category
  const grouped = useMemo(() => {
    if (!configs) return {};
    const map: Record<string, ConfigEntry[]> = {};
    for (const c of configs) {
      (map[c.category] ??= []).push(c);
    }
    return map;
  }, [configs]);

  // Reset edits when config loads — convert micro to human where needed
  useEffect(() => {
    if (configs) {
      const map: Record<string, string> = {};
      for (const c of configs) {
        map[c.key] = MICRO_LAUNCH_KEYS.has(c.key) ? microToHuman(c.value) : c.value;
      }
      setEdits(map);
    }
  }, [configs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const maintenanceEnabled = edits['MAINTENANCE_MODE'] === 'true';

  // Get the original display value for a config key
  const getOriginalDisplay = (key: string, rawValue: string) =>
    MICRO_LAUNCH_KEYS.has(key) ? microToHuman(rawValue) : rawValue;

  const handleToggleMaintenance = async () => {
    setSaveResult(null);
    try {
      const result = await toggleMaintenance.mutateAsync();
      setSaveResult(`Maintenance mode: ${result.enabled ? 'ENABLED' : 'disabled'}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSaveResult(`Error: ${message}`);
    }
  };

  // Collect changed entries — convert human back to micro where needed
  const getChangedEntries = (category: string) => {
    if (!configs) return [];
    return configs
      .filter((c) => c.category === category && edits[c.key] !== getOriginalDisplay(c.key, c.value))
      .map((c) => ({
        key: c.key,
        value: MICRO_LAUNCH_KEYS.has(c.key)
          ? humanToMicro(edits[c.key] ?? microToHuman(c.value))
          : edits[c.key] ?? c.value,
      }));
  };

  const handleSaveCategory = async (category: string) => {
    const changed = getChangedEntries(category);
    if (changed.length === 0) return;
    setSaveResult(null);
    try {
      await bulkUpdate.mutateAsync(changed);
      setSaveResult(`Saved ${changed.length} setting(s) in ${CATEGORY_LABELS[category] ?? category}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSaveResult(`Error: ${message}`);
    }
  };

  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) === -1 ? 99 : CATEGORY_ORDER.indexOf(a)) -
              (CATEGORY_ORDER.indexOf(b) === -1 ? 99 : CATEGORY_ORDER.indexOf(b)),
  );

  return (
    <div className="space-y-5">
      {/* Maintenance Quick Toggle */}
      <div className={`rounded-xl border p-4 ${maintenanceEnabled ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className={maintenanceEnabled ? 'text-red-400' : 'text-[var(--color-text-secondary)]'} />
            <div>
              <h3 className="text-sm font-bold">Maintenance Mode</h3>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {maintenanceEnabled
                  ? 'Platform is DOWN. Users see 503.'
                  : 'Platform is running normally.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMaintenance}
            disabled={toggleMaintenance.isPending}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
              maintenanceEnabled ? 'bg-red-500' : 'bg-[var(--color-border)]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                maintenanceEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Result */}
      {saveResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${saveResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {saveResult}
        </div>
      )}

      {/* Config Sections */}
      {sortedCategories
        .filter((cat) => cat !== 'maintenance')
        .map((category) => {
          const items = grouped[category] ?? [];
          const changedCount = getChangedEntries(category).length;

          return (
            <div key={category} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={16} className="text-[var(--color-primary)]" />
                  <h3 className="text-sm font-bold">{CATEGORY_LABELS[category] ?? category}</h3>
                </div>
                {changedCount > 0 && (
                  <ActionButton
                    onClick={() => handleSaveCategory(category)}
                    variant="success"
                    disabled={bulkUpdate.isPending}
                  >
                    <span className="flex items-center gap-1">
                      <Save size={12} />
                      Save {changedCount}
                    </span>
                  </ActionButton>
                )}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {items.map((cfg) => (
                  <ConfigField
                    key={cfg.key}
                    config={cfg}
                    value={edits[cfg.key] ?? getOriginalDisplay(cfg.key, cfg.value)}
                    onChange={(val) => setEdits((prev) => ({ ...prev, [cfg.key]: val }))}
                    isDirty={edits[cfg.key] !== getOriginalDisplay(cfg.key, cfg.value)}
                    isMicroLaunch={MICRO_LAUNCH_KEYS.has(cfg.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function ConfigField({
  config,
  value,
  onChange,
  isDirty,
  isMicroLaunch,
}: {
  config: ConfigEntry;
  value: string;
  onChange: (v: string) => void;
  isDirty: boolean;
  isMicroLaunch: boolean;
}) {
  const label = KEY_LABELS[config.key] ?? config.key.replace(/_/g, ' ');

  if (config.valueType === 'boolean') {
    return (
      <div className={`flex items-center justify-between rounded-lg border bg-[var(--color-bg)] px-3 py-2.5 ${
        isDirty ? 'border-amber-500/50' : 'border-[var(--color-border)]'
      }`}>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{label}</p>
          {config.description && (
            <p className="text-[10px] text-[var(--color-text-secondary)] truncate">{config.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(value === 'true' ? 'false' : 'true')}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            value === 'true' ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value === 'true' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  }

  if (config.valueType === 'json') {
    return (
      <div className="sm:col-span-2">
        <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider">
          {label}
          {config.description && <span className="normal-case tracking-normal ml-1">— {config.description}</span>}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={`w-full rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-xs font-mono focus:border-[var(--color-primary)] focus:outline-none resize-none ${
            isDirty ? 'border-amber-500/50' : 'border-[var(--color-border)]'
          }`}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="flex items-baseline gap-1 text-[10px] font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider">
        <span className="truncate">{label}</span>
        {isMicroLaunch && <span className="text-[var(--color-primary)] normal-case tracking-normal shrink-0">COIN</span>}
      </label>
      <input
        type={config.valueType === 'number' || isMicroLaunch ? 'number' : 'text'}
        step={isMicroLaunch ? 'any' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none ${
          isDirty ? 'border-amber-500/50' : 'border-[var(--color-border)]'
        }`}
      />
      {config.description && (
        <p className="text-[9px] text-[var(--color-text-secondary)] mt-0.5">{config.description}</p>
      )}
    </div>
  );
}
