'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Plus, Trash2, Sparkles, MessageSquare, Zap } from 'lucide-react';
import { API_URL } from '@/lib/constants';
import { ActionButton } from '../_shared';

interface Persona {
  id: string;
  name: string;
  prompt: string;
}

interface BotConfig {
  commentaryEnabled: boolean;
  chatBotEnabled: boolean;
  botName: string;
  systemPrompt: string;
  personas: Persona[];
  activePersonaId: string | null;
  model: string;
  chatCooldownSec: number;
  bigBetThreshold: number;
  streakThreshold: number;
  silenceMinutes: number;
  respondToMentions: boolean;
  reactToBigBets: boolean;
  reactToStreaks: boolean;
  postOnSilence: boolean;
  extraContext: string;
}

interface Commentary {
  betId: string;
  textRu: string;
  textEn: string;
  createdAt: string;
}

async function fetchConfig(): Promise<BotConfig> {
  const res = await fetch(`${API_URL}/api/v1/admin/ai-bot/config`, { credentials: 'include' });
  const json = await res.json();
  return json.data;
}

async function saveConfig(updates: Partial<BotConfig>): Promise<BotConfig> {
  const res = await fetch(`${API_URL}/api/v1/admin/ai-bot/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  const json = await res.json();
  return json.data;
}

async function fetchCommentary(): Promise<Commentary[]> {
  const res = await fetch(`${API_URL}/api/v1/admin/ai-bot/commentary?limit=20`, { credentials: 'include' });
  const json = await res.json();
  return json.data ?? [];
}

const inputClass = 'w-full rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]';
const labelClass = 'text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide';
const toggleClass = (on: boolean) =>
  `relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${on ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`;
const toggleDot = (on: boolean) =>
  `pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'} mt-0.5`;

export function AiBotTab() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [commentary, setCommentary] = useState<Commentary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [subTab, setSubTab] = useState<'general' | 'personas' | 'triggers' | 'preview'>('general');

  useEffect(() => {
    Promise.all([fetchConfig(), fetchCommentary()])
      .then(([cfg, cmts]) => {
        setConfig(cfg);
        setCommentary(cmts);
      })
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((partial: Partial<BotConfig>) => {
    setConfig(prev => prev ? { ...prev, ...partial } : prev);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!config || !dirty) return;
    setSaving(true);
    try {
      const saved = await saveConfig(config);
      setConfig(saved);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const addPersona = () => {
    if (!config) return;
    const id = `persona_${Date.now()}`;
    update({
      personas: [...config.personas, { id, name: 'New Persona', prompt: '' }],
    });
  };

  const removePersona = (id: string) => {
    if (!config) return;
    update({
      personas: config.personas.filter(p => p.id !== id),
      activePersonaId: config.activePersonaId === id ? null : config.activePersonaId,
    });
  };

  const updatePersona = (id: string, field: 'name' | 'prompt', value: string) => {
    if (!config) return;
    update({
      personas: config.personas.map(p => p.id === id ? { ...p, [field]: value } : p),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!config) {
    return <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">Failed to load config</p>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-400" />
          <h3 className="text-base font-bold">AI Bot (Oracle)</h3>
        </div>
        <ActionButton onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save'}
        </ActionButton>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)] pb-0">
        {(['general', 'personas', 'triggers', 'preview'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setSubTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              subTab === tab
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab === 'general' ? 'General' : tab === 'personas' ? 'Personas' : tab === 'triggers' ? 'Triggers' : 'Preview'}
          </button>
        ))}
      </div>

      {/* ═══ General ═══ */}
      {subTab === 'general' && (
        <div className="space-y-4">
          {/* Master toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span className="text-sm font-medium">Commentary (Ticker)</span>
              </div>
              <button type="button" className={toggleClass(config.commentaryEnabled)}
                onClick={() => update({ commentaryEnabled: !config.commentaryEnabled })}>
                <span className={toggleDot(config.commentaryEnabled)} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-indigo-400" />
                <span className="text-sm font-medium">Chat Bot</span>
              </div>
              <button type="button" className={toggleClass(config.chatBotEnabled)}
                onClick={() => update({ chatBotEnabled: !config.chatBotEnabled })}>
                <span className={toggleDot(config.chatBotEnabled)} />
              </button>
            </div>
          </div>

          {/* Bot name & model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Bot Name</label>
              <input className={inputClass} value={config.botName}
                onChange={e => update({ botName: e.target.value })} maxLength={30} />
            </div>
            <div>
              <label className={labelClass}>GPT Model</label>
              <select className={inputClass} value={config.model}
                onChange={e => update({ model: e.target.value })}>
                <option value="gpt-4o-mini">gpt-4o-mini (cheap, fast)</option>
                <option value="gpt-4o">gpt-4o (smarter, 10x cost)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1-nano">gpt-4.1-nano (cheapest)</option>
              </select>
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className={labelClass}>System Prompt</label>
            <textarea className={`${inputClass} h-40 resize-y font-mono text-xs`}
              value={config.systemPrompt}
              onChange={e => update({ systemPrompt: e.target.value })}
              placeholder="Define the bot's personality, tone, and rules..." />
          </div>

          {/* Extra context */}
          <div>
            <label className={labelClass}>Extra Context (appended to system prompt)</label>
            <textarea className={`${inputClass} h-24 resize-y text-xs`}
              value={config.extraContext}
              onChange={e => update({ extraContext: e.target.value })}
              placeholder="Add temporary context, event announcements, special rules..." />
          </div>
        </div>
      )}

      {/* ═══ Personas ═══ */}
      {subTab === 'personas' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Personas overlay the base system prompt. Only one active at a time. Switch to change the bot&apos;s style.
          </p>

          {/* Active persona selector */}
          <div>
            <label className={labelClass}>Active Persona</label>
            <select className={inputClass} value={config.activePersonaId ?? ''}
              onChange={e => update({ activePersonaId: e.target.value || null })}>
              <option value="">None (base prompt only)</option>
              {config.personas.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Persona list */}
          {config.personas.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2">
              <div className="flex items-center gap-2">
                <input className={`${inputClass} flex-1`} value={p.name}
                  onChange={e => updatePersona(p.id, 'name', e.target.value)}
                  placeholder="Persona name" />
                <button type="button" onClick={() => removePersona(p.id)}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea className={`${inputClass} h-24 resize-y text-xs`}
                value={p.prompt}
                onChange={e => updatePersona(p.id, 'prompt', e.target.value)}
                placeholder="Persona-specific prompt overlay..." />
            </div>
          ))}

          <button type="button" onClick={addPersona}
            className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline">
            <Plus size={14} /> Add Persona
          </button>
        </div>
      )}

      {/* ═══ Triggers ═══ */}
      {subTab === 'triggers' && (
        <div className="space-y-4">
          {/* Toggle triggers */}
          <div className="space-y-2">
            {([
              { key: 'respondToMentions' as const, label: 'Respond to @mention', desc: 'Bot replies when mentioned in chat' },
              { key: 'reactToBigBets' as const, label: 'React to big bets', desc: 'Posts in chat when a large bet is created' },
              { key: 'reactToStreaks' as const, label: 'React to win streaks', desc: 'Comments on consecutive wins' },
              { key: 'postOnSilence' as const, label: 'Post on silence', desc: 'Starts conversation when chat is quiet' },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div>
                  <span className="text-sm font-medium">{label}</span>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{desc}</p>
                </div>
                <button type="button" className={toggleClass(config[key])}
                  onClick={() => update({ [key]: !config[key] })}>
                  <span className={toggleDot(config[key])} />
                </button>
              </div>
            ))}
          </div>

          {/* Numeric thresholds */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Chat Cooldown (sec)</label>
              <input type="number" className={inputClass} value={config.chatCooldownSec}
                onChange={e => update({ chatCooldownSec: Number(e.target.value) })} min={5} max={300} />
            </div>
            <div>
              <label className={labelClass}>Big Bet Threshold</label>
              <input type="number" className={inputClass} value={config.bigBetThreshold}
                onChange={e => update({ bigBetThreshold: Number(e.target.value) })} min={1} />
            </div>
            <div>
              <label className={labelClass}>Streak Threshold</label>
              <input type="number" className={inputClass} value={config.streakThreshold}
                onChange={e => update({ streakThreshold: Number(e.target.value) })} min={2} max={20} />
            </div>
            <div>
              <label className={labelClass}>Silence (min)</label>
              <input type="number" className={inputClass} value={config.silenceMinutes}
                onChange={e => update({ silenceMinutes: Number(e.target.value) })} min={5} max={120} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Preview ═══ */}
      {subTab === 'preview' && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Recent Commentary (Ticker)</h4>
          {commentary.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] py-4 text-center">No commentary yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {commentary.map((c) => (
                <div key={c.betId + c.createdAt} className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-[var(--color-text-secondary)]">
                      Bet #{c.betId}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs mb-0.5"><span className="text-[10px] font-semibold text-blue-400">RU:</span> {c.textRu}</p>
                  <p className="text-xs"><span className="text-[10px] font-semibold text-red-400">EN:</span> {c.textEn}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
