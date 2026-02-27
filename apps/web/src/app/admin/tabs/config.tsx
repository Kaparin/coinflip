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

const CATEGORY_ORDER = ['game', 'display', 'commission', 'sponsored', 'maintenance', 'general'];
const CATEGORY_LABELS: Record<string, string> = {
  game: 'Game Settings',
  display: 'Display Settings',
  commission: 'Commission',
  sponsored: 'Sponsored Announcements',
  maintenance: 'Maintenance',
  general: 'General',
};

export function ConfigTab() {
  const { data: configs, isLoading } = useAdminConfig();
  const bulkUpdate = useAdminBulkUpdateConfig();
  const toggleMaintenance = useAdminToggleMaintenance();

  // Local editable state
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

  // Reset edits when config loads
  useEffect(() => {
    if (configs) {
      const map: Record<string, string> = {};
      for (const c of configs) {
        map[c.key] = c.value;
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

  // Collect changed entries
  const getChangedEntries = (category: string) => {
    if (!configs) return [];
    return configs
      .filter((c) => c.category === category && edits[c.key] !== c.value)
      .map((c) => ({ key: c.key, value: edits[c.key] ?? c.value }));
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
    <div className="space-y-6">
      {/* Maintenance Quick Toggle */}
      <div className={`rounded-xl border p-5 ${maintenanceEnabled ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className={maintenanceEnabled ? 'text-red-400' : 'text-[var(--color-text-secondary)]'} />
            <div>
              <h3 className="text-sm font-bold">Maintenance Mode</h3>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {maintenanceEnabled
                  ? 'Platform is DOWN for maintenance. Users see 503.'
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
            <div key={category} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
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
                      Save {changedCount} change{changedCount > 1 ? 's' : ''}
                    </span>
                  </ActionButton>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((cfg) => (
                  <ConfigField
                    key={cfg.key}
                    config={cfg}
                    value={edits[cfg.key] ?? cfg.value}
                    onChange={(val) => setEdits((prev) => ({ ...prev, [cfg.key]: val }))}
                    isDirty={edits[cfg.key] !== cfg.value}
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
}: {
  config: ConfigEntry;
  value: string;
  onChange: (v: string) => void;
  isDirty: boolean;
}) {
  const label = config.key.replace(/_/g, ' ');

  if (config.valueType === 'boolean') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
        <div>
          <p className="text-xs font-medium">{label}</p>
          {config.description && (
            <p className="text-[10px] text-[var(--color-text-secondary)]">{config.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(value === 'true' ? 'false' : 'true')}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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
      <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider">
        {label}
        {config.description && <span className="normal-case tracking-normal ml-1">— {config.description}</span>}
      </label>
      <input
        type={config.valueType === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none ${
          isDirty ? 'border-amber-500/50' : 'border-[var(--color-border)]'
        }`}
      />
    </div>
  );
}
