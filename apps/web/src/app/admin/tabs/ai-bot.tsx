'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Save, Plus, Trash2, Sparkles, MessageSquare, Zap, RefreshCw,
  AlertTriangle, Copy, Play, ChevronDown, ChevronUp, Eye, BarChart3, Shield, Target,
  Calendar, List, Edit3, ToggleLeft, X,
} from 'lucide-react';
import { API_URL } from '@/lib/constants';
import { ActionButton } from '../_shared';

// ─── Types ──────────────────────────────────────────────

interface PersonaSchedule {
  days?: number[];
  startHour?: number;
  endHour?: number;
  timezone?: string;
}

interface Persona {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  prompt: string;
  enabled?: boolean;
  priority?: number;
  color?: string;
  avatarUrl?: string;
  displayName?: string;
  nameColor?: string;
  schedule?: PersonaSchedule;
}

interface TriggerMapping {
  eventType: string;
  personaId: string | null;
  enabled: boolean;
  cooldownSec?: number;
  minBetThreshold?: number;
  probability?: number;
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
  triggerMappings: TriggerMapping[];
  antiRepeatCount: number;
  safetyStrict: boolean;
  // New style/safety fields
  temperature: number;
  emojiIntensity: number;
  humorLevel: number;
  dramaLevel: number;
  sarcasmLevel: number;
  premiumLevel: number;
  fairnessMentions: boolean;
  profanityFilter: boolean;
  safetyMode: string;
  bannedPhrases: string[];
  softBannedPatterns: string[];
}

interface Commentary {
  betId: string;
  textRu: string;
  textEn: string;
  createdAt: string;
  eventType?: string;
  personaId?: string;
  inputContext?: Record<string, unknown>;
  wasRegenerated?: boolean;
  wasDelivered?: boolean;
  similarityScore?: number;
}

interface ChatMessage {
  id: string;
  message: string;
  createdAt: string;
  inputContext?: Record<string, unknown>;
  wasRegenerated?: boolean;
  wasDelivered?: boolean;
  similarityScore?: number;
}

interface BotStats {
  totalCommentary: number;
  totalChatMessages: number;
  lastCommentaryAt: string | null;
  lastChatMessageAt: string | null;
  commentaryByEvent: Record<string, number>;
  commentaryByPersona: Record<string, number>;
  avgLength: number;
  regenRate: number;
  personaUsage: Record<string, number>;
}

interface PreviewResult {
  ru: string;
  en: string;
  personaUsed: string | null;
  systemPrompt: string;
  userPrompt: string;
}

interface PhraseRule {
  id: string;
  type: 'blacklist' | 'cooldown' | 'preferred' | 'forbidden_opening';
  phrase: string;
  enabled: boolean;
  cooldownSec?: number;
  createdAt?: string;
}

// ─── API helpers ────────────────────────────────────────

const api = (path: string, opts?: RequestInit) =>
  fetch(`${API_URL}/api/v1/admin/ai-bot${path}`, { credentials: 'include', ...opts }).then(r => r.json());

const fetchConfig = (): Promise<BotConfig> => api('/config').then(j => j.data);
const saveConfig = (u: Partial<BotConfig>): Promise<BotConfig> =>
  api('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) }).then(j => j.data);
const fetchCommentary = (): Promise<Commentary[]> => api('/commentary?limit=50').then(j => j.data ?? []);
const fetchChatMessages = (): Promise<ChatMessage[]> => api('/chat-messages?limit=50').then(j => j.data ?? []);
const fetchStats = (): Promise<BotStats> => api('/stats').then(j => j.data);
const fetchDefaults = () => api('/defaults').then(j => j.data);
const clearCommentaryApi = (): Promise<number> => api('/commentary', { method: 'DELETE' }).then(j => j.data?.deleted ?? 0);
const clearChatMessagesApi = (): Promise<number> => api('/chat-messages', { method: 'DELETE' }).then(j => j.data?.deleted ?? 0);
const generatePreview = (body: Record<string, unknown>): Promise<PreviewResult | null> =>
  api('/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(j => j.data ?? null)
    .catch(() => null);

// Phrase rules API
const fetchPhraseRules = (): Promise<PhraseRule[]> => api('/phrase-rules').then(j => j.data ?? []);
const createPhraseRule = (body: Omit<PhraseRule, 'id' | 'createdAt'>): Promise<PhraseRule> =>
  api('/phrase-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j => j.data);
const updatePhraseRule = (id: string, body: Partial<PhraseRule>): Promise<PhraseRule> =>
  api(`/phrase-rules/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j => j.data);
const deletePhraseRuleApi = (id: string) =>
  api(`/phrase-rules/${id}`, { method: 'DELETE' });

// ─── Style helpers ──────────────────────────────────────

const inputClass = 'w-full rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]';
const labelClass = 'text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-0.5 block';
const toggleClass = (on: boolean) =>
  `relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${on ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`;
const toggleDot = (on: boolean) =>
  `pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'} mt-0.5`;
const cardClass = 'rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3';
const dangerCardClass = 'rounded-xl bg-[var(--color-surface)] border border-red-500/20 p-4 space-y-2';

type SubTab = 'general' | 'personas' | 'triggers' | 'phrases' | 'preview' | 'history' | 'analytics' | 'actions';

const SUB_TABS: Array<{ id: SubTab; label: string; icon: typeof Sparkles }> = [
  { id: 'general', label: 'General', icon: Zap },
  { id: 'personas', label: 'Personas', icon: Sparkles },
  { id: 'triggers', label: 'Triggers', icon: Target },
  { id: 'phrases', label: 'Phrases', icon: List },
  { id: 'preview', label: 'Preview', icon: Play },
  { id: 'history', label: 'History', icon: Eye },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'actions', label: 'Actions', icon: AlertTriangle },
];

const EVENT_TYPES = [
  'bet_comment', 'big_bet', 'huge_bet', 'win_comment', 'loss_comment',
  'streak_comment', 'upset_comment', 'chat_reply', 'fairness_reply',
  'silence', 'jackpot', 'system_announcement',
];

const EVENT_LABELS: Record<string, string> = {
  bet_comment: 'Regular Bet',
  big_bet: 'Big Bet',
  huge_bet: 'Huge Bet',
  win_comment: 'Win',
  loss_comment: 'Loss',
  streak_comment: 'Win Streak',
  upset_comment: 'Upset',
  chat_reply: 'Chat Reply',
  fairness_reply: 'Fairness Q',
  silence: 'Silence Filler',
  jackpot: 'Jackpot',
  system_announcement: 'Announcement',
};

const PHRASE_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  blacklist: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Blacklist' },
  cooldown: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Cooldown' },
  preferred: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Preferred' },
  forbidden_opening: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Forbidden Opening' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SAFETY_MODES = [
  { value: 'strict', label: 'Strict' },
  { value: 'playful', label: 'Playful' },
  { value: 'safe_chat', label: 'Safe Chat' },
  { value: 'event_only', label: 'Event Only' },
  { value: 'chat_read_only', label: 'Chat Read-Only' },
];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// ─── Range Slider helper ────────────────────────────────

function RangeInput({
  label, value, onChange, min, max, step, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelClass}>{label}</label>
        <span className="text-[11px] font-bold tabular-nums text-[var(--color-primary)]">
          {value}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--color-border)] accent-[var(--color-primary)]" />
      <div className="flex justify-between text-[9px] text-[var(--color-text-secondary)] mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────

export function AiBotTab() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [commentary, setCommentary] = useState<Commentary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('general');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  // Preview state
  const [previewEvent, setPreviewEvent] = useState('bet_comment');
  const [previewPersona, setPreviewPersona] = useState('');
  const [previewPlayer, setPreviewPlayer] = useState('TestPlayer');
  const [previewOpponent, setPreviewOpponent] = useState('Opponent');
  const [previewAmount, setPreviewAmount] = useState(100);
  const [previewStreak, setPreviewStreak] = useState(0);
  const [previewSide, setPreviewSide] = useState('heads');
  const [previewChat, setPreviewChat] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRawPrompt, setShowRawPrompt] = useState(false);

  // A/B Compare state
  const [abMode, setAbMode] = useState(false);
  const [abPersonaA, setAbPersonaA] = useState('');
  const [abPersonaB, setAbPersonaB] = useState('');
  const [abResultA, setAbResultA] = useState<PreviewResult | null>(null);
  const [abResultB, setAbResultB] = useState<PreviewResult | null>(null);

  // Phrase rules state
  const [phraseRules, setPhraseRules] = useState<PhraseRule[]>([]);
  const [phraseRulesLoaded, setPhraseRulesLoaded] = useState(false);
  const [phraseEditing, setPhraseEditing] = useState<string | null>(null);
  const [phraseEditData, setPhraseEditData] = useState<Partial<PhraseRule>>({});
  const [phraseAdding, setPhraseAdding] = useState(false);
  const [newPhrase, setNewPhrase] = useState<Omit<PhraseRule, 'id' | 'createdAt'>>({
    type: 'blacklist', phrase: '', enabled: true, cooldownSec: 60,
  });
  const [phraseSaving, setPhraseSaving] = useState(false);

  // History expand state
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [cfg, cmts, msgs, st] = await Promise.all([
        fetchConfig(), fetchCommentary(), fetchChatMessages(), fetchStats(),
      ]);
      setConfig(cfg);
      setCommentary(cmts);
      setChatMessages(msgs);
      setStats(st);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load phrase rules when tab switches to phrases
  useEffect(() => {
    if (subTab === 'phrases' && !phraseRulesLoaded) {
      fetchPhraseRules().then(rules => {
        setPhraseRules(rules);
        setPhraseRulesLoaded(true);
      }).catch(() => setPhraseRulesLoaded(true));
    }
  }, [subTab, phraseRulesLoaded]);

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
    } finally { setSaving(false); }
  };

  // ─── Persona helpers ─────────────────────

  const addPersona = () => {
    if (!config) return;
    const id = `persona_${Date.now()}`;
    update({
      personas: [...config.personas, {
        id, name: 'New Persona', slug: 'new-persona',
        description: '', prompt: '', enabled: true, priority: config.personas.length + 1, color: '#6366f1',
      }],
    });
  };

  const clonePersona = (p: Persona) => {
    if (!config) return;
    const id = `${p.id}_copy_${Date.now()}`;
    update({
      personas: [...config.personas, {
        ...p, id, name: `${p.name} (copy)`, slug: `${p.slug ?? p.id}-copy`,
      }],
    });
  };

  const removePersona = (id: string) => {
    if (!config) return;
    update({
      personas: config.personas.filter(p => p.id !== id),
      activePersonaId: config.activePersonaId === id ? null : config.activePersonaId,
    });
  };

  const updatePersona = (id: string, field: string, value: unknown) => {
    if (!config) return;
    update({
      personas: config.personas.map(p => p.id === id ? { ...p, [field]: value } : p),
    });
  };

  // ─── Trigger helpers ─────────────────────

  const updateTrigger = (eventType: string, field: keyof TriggerMapping, value: unknown) => {
    if (!config) return;
    const existing = config.triggerMappings.find(t => t.eventType === eventType);
    if (existing) {
      update({
        triggerMappings: config.triggerMappings.map(t =>
          t.eventType === eventType ? { ...t, [field]: value } : t),
      });
    } else {
      update({
        triggerMappings: [...config.triggerMappings, {
          eventType, personaId: null, enabled: true,
          cooldownSec: 0, minBetThreshold: 0, probability: 100,
          [field]: value,
        }],
      });
    }
  };

  // ─── Preview ─────────────────────────────

  const handlePreview = async () => {
    if (abMode) {
      // A/B compare mode
      setPreviewLoading(true);
      setAbResultA(null);
      setAbResultB(null);
      const baseBody = {
        eventType: previewEvent,
        player: previewPlayer,
        opponent: previewOpponent,
        amount: previewAmount,
        streak: previewStreak || undefined,
        side: previewSide,
        result: 'win' as const,
        chatMessage: previewChat || undefined,
      };
      const [resultA, resultB] = await Promise.all([
        generatePreview({ ...baseBody, personaId: abPersonaA || undefined }),
        generatePreview({ ...baseBody, personaId: abPersonaB || undefined }),
      ]);
      setAbResultA(resultA);
      setAbResultB(resultB);
      setPreviewLoading(false);
    } else {
      setPreviewLoading(true);
      setPreviewResult(null);
      const result = await generatePreview({
        eventType: previewEvent,
        personaId: previewPersona || undefined,
        player: previewPlayer,
        opponent: previewOpponent,
        amount: previewAmount,
        streak: previewStreak || undefined,
        side: previewSide,
        result: 'win',
        chatMessage: previewChat || undefined,
      });
      setPreviewResult(result);
      setPreviewLoading(false);
    }
  };

  // ─── Phrase rule helpers ──────────────────

  const handleCreatePhrase = async () => {
    if (!newPhrase.phrase.trim()) return;
    setPhraseSaving(true);
    try {
      const created = await createPhraseRule(newPhrase);
      setPhraseRules(prev => [...prev, created]);
      setNewPhrase({ type: 'blacklist', phrase: '', enabled: true, cooldownSec: 60 });
      setPhraseAdding(false);
    } catch { /* silent */ }
    finally { setPhraseSaving(false); }
  };

  const handleUpdatePhrase = async (id: string) => {
    setPhraseSaving(true);
    try {
      const updated = await updatePhraseRule(id, phraseEditData);
      setPhraseRules(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
      setPhraseEditing(null);
      setPhraseEditData({});
    } catch { /* silent */ }
    finally { setPhraseSaving(false); }
  };

  const handleDeletePhrase = async (id: string) => {
    if (!confirm('Delete this phrase rule?')) return;
    try {
      await deletePhraseRuleApi(id);
      setPhraseRules(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ }
  };

  const handleTogglePhrase = async (rule: PhraseRule) => {
    try {
      const updated = await updatePhraseRule(rule.id, { enabled: !rule.enabled });
      setPhraseRules(prev => prev.map(r => r.id === rule.id ? { ...r, ...updated } : r));
    } catch { /* silent */ }
  };

  // ─── History expand helpers ───────────────

  const toggleHistoryExpand = (key: string) => {
    setExpandedHistoryItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ─── Action helpers ──────────────────────

  const handleClearCommentary = async () => {
    if (!confirm('Delete ALL AI commentary? Cannot be undone.')) return;
    setActionLoading('commentary');
    setActionResult(null);
    try {
      const deleted = await clearCommentaryApi();
      setActionResult(`Deleted ${deleted} commentary entries`);
      setCommentary([]);
      setStats(await fetchStats());
    } catch { setActionResult('Error'); }
    finally { setActionLoading(null); }
  };

  const handleClearChat = async () => {
    if (!confirm('Delete ALL bot chat messages? Cannot be undone.')) return;
    setActionLoading('chat');
    setActionResult(null);
    try {
      const deleted = await clearChatMessagesApi();
      setActionResult(`Deleted ${deleted} bot chat messages`);
      setChatMessages([]);
      setStats(await fetchStats());
    } catch { setActionResult('Error'); }
    finally { setActionLoading(null); }
  };

  const handleResetDefaults = async () => {
    if (!confirm('Reset system prompt, personas, and triggers to defaults?')) return;
    setActionLoading('reset');
    try {
      const defaults = await fetchDefaults();
      update({
        systemPrompt: defaults.systemPrompt,
        personas: defaults.personas,
        triggerMappings: defaults.triggerMappings,
      });
      setActionResult('Defaults loaded — click Save to apply');
    } catch { setActionResult('Error loading defaults'); }
    finally { setActionLoading(null); }
  };

  // ─── Render ──────────────────────────────

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

  const enabledPersonas = config.personas.filter(p => p.enabled !== false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-400" />
          <h3 className="text-base font-bold">AI Bot (Oracle)</h3>
          {stats && (
            <span className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full">
              {stats.totalCommentary}c / {stats.totalChatMessages}m
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setLoading(true); loadData(); }}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            title="Refresh">
            <RefreshCw size={14} />
          </button>
          <ActionButton onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : dirty ? 'Save *' : 'Save'}
          </ActionButton>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)] pb-0 overflow-x-auto">
        {SUB_TABS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setSubTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              subTab === id
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ GENERAL ═══ */}
      {subTab === 'general' && (
        <div className="space-y-4">
          {/* Master toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: 'commentaryEnabled' as const, label: 'Commentary (Ticker)', icon: Zap, color: 'text-amber-400' },
              { key: 'chatBotEnabled' as const, label: 'Chat Bot', icon: MessageSquare, color: 'text-indigo-400' },
            ]).map(({ key, label, icon: Icon, color }) => (
              <div key={key} className={`flex items-center justify-between ${cardClass}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={color} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <button type="button" className={toggleClass(config[key])}
                  onClick={() => update({ [key]: !config[key] })}>
                  <span className={toggleDot(config[key])} />
                </button>
              </div>
            ))}
          </div>

          {/* Bot name, model, safety */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Bot Name</label>
              <input className={inputClass} value={config.botName}
                onChange={e => update({ botName: e.target.value })} maxLength={30} />
            </div>
            <div>
              <label className={labelClass}>GPT Model</label>
              <select className={inputClass} value={config.model}
                onChange={e => update({ model: e.target.value })}>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1-nano">gpt-4.1-nano</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Anti-Repeat Buffer</label>
              <input type="number" className={inputClass} value={config.antiRepeatCount}
                onChange={e => update({ antiRepeatCount: Number(e.target.value) })} min={0} max={100} />
            </div>
          </div>

          {/* Safety toggle */}
          <div className={`flex items-center justify-between ${cardClass}`}>
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-emerald-400" />
              <div>
                <span className="text-sm font-medium">Strict Safety Mode</span>
                <p className="text-[10px] text-[var(--color-text-secondary)]">Extra filtering for financial advice, guaranteed wins, etc.</p>
              </div>
            </div>
            <button type="button" className={toggleClass(config.safetyStrict)}
              onClick={() => update({ safetyStrict: !config.safetyStrict })}>
              <span className={toggleDot(config.safetyStrict)} />
            </button>
          </div>

          {/* System prompt */}
          <div>
            <label className={labelClass}>Base System Prompt</label>
            <textarea className={`${inputClass} h-48 resize-y font-mono text-xs`}
              value={config.systemPrompt}
              onChange={e => update({ systemPrompt: e.target.value })} />
          </div>

          {/* Extra context */}
          <div>
            <label className={labelClass}>Extra Context (appended to system prompt)</label>
            <textarea className={`${inputClass} h-20 resize-y text-xs`}
              value={config.extraContext}
              onChange={e => update({ extraContext: e.target.value })}
              placeholder="Temporary context, event announcements, special rules..." />
          </div>

          {/* Default persona selector */}
          <div>
            <label className={labelClass}>Default Active Persona</label>
            <select className={inputClass} value={config.activePersonaId ?? ''}
              onChange={e => update({ activePersonaId: e.target.value || null })}>
              <option value="">None (base prompt only)</option>
              {enabledPersonas.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* ── Style Levels Card ── */}
          <div className={cardClass}>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Sparkles size={14} className="text-violet-400" />
              Style Levels
            </h4>
            <div className="space-y-3">
              <RangeInput label="Temperature" value={config.temperature ?? 0.7}
                onChange={v => update({ temperature: v })}
                min={0.1} max={2.0} step={0.05} />
              <RangeInput label="Emoji Intensity" value={config.emojiIntensity ?? 1}
                onChange={v => update({ emojiIntensity: v })}
                min={0} max={3} step={1} />
              <RangeInput label="Humor Level" value={config.humorLevel ?? 2}
                onChange={v => update({ humorLevel: v })}
                min={0} max={5} step={1} />
              <RangeInput label="Drama Level" value={config.dramaLevel ?? 2}
                onChange={v => update({ dramaLevel: v })}
                min={0} max={5} step={1} />
              <RangeInput label="Sarcasm Level" value={config.sarcasmLevel ?? 1}
                onChange={v => update({ sarcasmLevel: v })}
                min={0} max={5} step={1} />
              <RangeInput label="Premium Level" value={config.premiumLevel ?? 1}
                onChange={v => update({ premiumLevel: v })}
                min={0} max={5} step={1} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className={`flex items-center justify-between ${cardClass}`}>
                  <span className="text-xs font-medium">Fairness Mentions</span>
                  <button type="button" className={toggleClass(config.fairnessMentions ?? false)}
                    onClick={() => update({ fairnessMentions: !(config.fairnessMentions ?? false) })}>
                    <span className={toggleDot(config.fairnessMentions ?? false)} />
                  </button>
                </div>
                <div className={`flex items-center justify-between ${cardClass}`}>
                  <span className="text-xs font-medium">Profanity Filter</span>
                  <button type="button" className={toggleClass(config.profanityFilter ?? true)}
                    onClick={() => update({ profanityFilter: !(config.profanityFilter ?? true) })}>
                    <span className={toggleDot(config.profanityFilter ?? true)} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Safety Card ── */}
          <div className={cardClass}>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Shield size={14} className="text-emerald-400" />
              Safety
            </h4>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Safety Mode</label>
                <select className={inputClass} value={config.safetyMode ?? 'strict'}
                  onChange={e => update({ safetyMode: e.target.value })}>
                  {SAFETY_MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Banned Phrases (one per line)</label>
                <textarea className={`${inputClass} h-24 resize-y text-xs font-mono`}
                  value={(config.bannedPhrases ?? []).join('\n')}
                  onChange={e => update({ bannedPhrases: e.target.value.split('\n').filter(Boolean) })}
                  placeholder="guaranteed win&#10;free money&#10;100% profit" />
              </div>
              <div>
                <label className={labelClass}>Soft-Banned Patterns (one regex per line)</label>
                <textarea className={`${inputClass} h-24 resize-y text-xs font-mono`}
                  value={(config.softBannedPatterns ?? []).join('\n')}
                  onChange={e => update({ softBannedPatterns: e.target.value.split('\n').filter(Boolean) })}
                  placeholder="invest.*guaranteed&#10;100%\s+profit&#10;easy\s+money" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PERSONAS ═══ */}
      {subTab === 'personas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-text-secondary)]">
              {config.personas.length} personas ({enabledPersonas.length} enabled)
            </p>
            <button type="button" onClick={addPersona}
              className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline">
              <Plus size={14} /> New Persona
            </button>
          </div>

          {config.personas.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              isActive={config.activePersonaId === p.id}
              onUpdate={(field, value) => updatePersona(p.id, field, value)}
              onClone={() => clonePersona(p)}
              onRemove={() => removePersona(p.id)}
              onSetActive={() => update({ activePersonaId: p.id })}
            />
          ))}
        </div>
      )}

      {/* ═══ TRIGGERS ═══ */}
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
              <div key={key} className={`flex items-center justify-between ${cardClass}`}>
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
                onChange={e => update({ silenceMinutes: Number(e.target.value) })} min={5} max={1440} />
            </div>
          </div>

          {/* Event → Persona mapping table */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Target size={14} className="text-[var(--color-primary)]" />
              Event → Persona Mapping
            </h4>
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_60px_70px_60px] gap-0 text-[10px] font-semibold uppercase text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-3 py-2 border-b border-[var(--color-border)]">
                <span>Event</span>
                <span>Persona</span>
                <span>CD (s)</span>
                <span>Prob %</span>
                <span>On</span>
              </div>
              {EVENT_TYPES.map(et => {
                const trigger = config.triggerMappings.find(t => t.eventType === et);
                return (
                  <div key={et} className="grid grid-cols-[1fr_1fr_60px_70px_60px] gap-0 items-center px-3 py-1.5 border-b border-[var(--color-border)] last:border-b-0 text-xs">
                    <span className="font-medium">{EVENT_LABELS[et] ?? et}</span>
                    <select className="bg-transparent text-xs border-none outline-none"
                      value={trigger?.personaId ?? ''}
                      onChange={e => updateTrigger(et, 'personaId', e.target.value || null)}>
                      <option value="">Default</option>
                      {config.personas.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input type="number" className="w-12 bg-transparent text-xs border-none outline-none tabular-nums"
                      value={trigger?.cooldownSec ?? 0}
                      onChange={e => updateTrigger(et, 'cooldownSec', Number(e.target.value))}
                      min={0} />
                    <input type="number" className="w-14 bg-transparent text-xs border-none outline-none tabular-nums"
                      value={trigger?.probability ?? 100}
                      onChange={e => updateTrigger(et, 'probability', Number(e.target.value))}
                      min={0} max={100} />
                    <button type="button"
                      className={toggleClass(trigger?.enabled !== false)}
                      onClick={() => updateTrigger(et, 'enabled', trigger?.enabled === false)}>
                      <span className={toggleDot(trigger?.enabled !== false)} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHRASES ═══ */}
      {subTab === 'phrases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Phrase rules: blacklist, cooldown limits, preferred phrases, forbidden openings.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setPhraseRulesLoaded(false); }}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                title="Refresh rules">
                <RefreshCw size={14} />
              </button>
              <button type="button" onClick={() => setPhraseAdding(true)}
                className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline">
                <Plus size={14} /> Add Rule
              </button>
            </div>
          </div>

          {/* Add new rule form */}
          {phraseAdding && (
            <div className={`${cardClass} space-y-2 border-[var(--color-primary)]/30`}>
              <h4 className="text-xs font-semibold">New Phrase Rule</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={newPhrase.type}
                    onChange={e => setNewPhrase(prev => ({ ...prev, type: e.target.value as PhraseRule['type'] }))}>
                    <option value="blacklist">Blacklist</option>
                    <option value="cooldown">Cooldown</option>
                    <option value="preferred">Preferred</option>
                    <option value="forbidden_opening">Forbidden Opening</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Phrase</label>
                  <input className={inputClass} value={newPhrase.phrase}
                    onChange={e => setNewPhrase(prev => ({ ...prev, phrase: e.target.value }))}
                    placeholder="Enter phrase or pattern..." />
                </div>
                {newPhrase.type === 'cooldown' && (
                  <div>
                    <label className={labelClass}>Cooldown (sec)</label>
                    <input type="number" className={inputClass} value={newPhrase.cooldownSec ?? 60}
                      onChange={e => setNewPhrase(prev => ({ ...prev, cooldownSec: Number(e.target.value) }))}
                      min={1} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <ActionButton onClick={handleCreatePhrase} disabled={phraseSaving || !newPhrase.phrase.trim()}>
                  {phraseSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Create
                </ActionButton>
                <button type="button" onClick={() => setPhraseAdding(false)}
                  className="text-xs text-[var(--color-text-secondary)] hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Grouped rules */}
          {(['blacklist', 'cooldown', 'preferred', 'forbidden_opening'] as const).map(type => {
            const rules = phraseRules.filter(r => r.type === type);
            if (rules.length === 0) return null;
            const style = PHRASE_TYPE_COLORS[type] ?? { bg: 'bg-gray-500/10', text: 'text-gray-400', label: type };
            return (
              <div key={type}>
                <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${style.text}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <span className="text-[var(--color-text-secondary)] font-normal">({rules.length})</span>
                </h4>
                <div className="space-y-1">
                  {rules.map(rule => (
                    <div key={rule.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      rule.enabled ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-[var(--color-border)]/50 bg-[var(--color-surface)] opacity-50'
                    }`}>
                      {phraseEditing === rule.id ? (
                        // Edit mode
                        <div className="flex-1 flex items-center gap-2 flex-wrap">
                          <input className={`${inputClass} flex-1 min-w-[150px]`}
                            value={phraseEditData.phrase ?? rule.phrase}
                            onChange={e => setPhraseEditData(prev => ({ ...prev, phrase: e.target.value }))} />
                          {rule.type === 'cooldown' && (
                            <input type="number" className={`${inputClass} w-20`}
                              value={phraseEditData.cooldownSec ?? rule.cooldownSec ?? 60}
                              onChange={e => setPhraseEditData(prev => ({ ...prev, cooldownSec: Number(e.target.value) }))}
                              min={1} />
                          )}
                          <button type="button" onClick={() => handleUpdatePhrase(rule.id)}
                            disabled={phraseSaving}
                            className="text-[10px] font-medium px-2 py-1 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20">
                            {phraseSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setPhraseEditing(null); setPhraseEditData({}); }}
                            className="text-[10px] text-[var(--color-text-secondary)] hover:underline">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        // Display mode
                        <>
                          <span className="text-xs font-medium flex-1">{rule.phrase}</span>
                          {rule.type === 'cooldown' && rule.cooldownSec && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 tabular-nums">
                              {rule.cooldownSec}s
                            </span>
                          )}
                          <button type="button" onClick={() => handleTogglePhrase(rule)}
                            className={toggleClass(rule.enabled)}>
                            <span className={toggleDot(rule.enabled)} />
                          </button>
                          <button type="button"
                            onClick={() => { setPhraseEditing(rule.id); setPhraseEditData({ phrase: rule.phrase, cooldownSec: rule.cooldownSec }); }}
                            className="p-1 rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
                            <Edit3 size={12} />
                          </button>
                          <button type="button" onClick={() => handleDeletePhrase(rule.id)}
                            className="p-1 rounded text-red-400 hover:bg-red-500/10">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {phraseRules.length === 0 && phraseRulesLoaded && (
            <p className="text-xs text-[var(--color-text-secondary)] py-8 text-center">No phrase rules yet. Click &quot;Add Rule&quot; to create one.</p>
          )}
        </div>
      )}

      {/* ═══ PREVIEW ═══ */}
      {subTab === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Test any event/persona combination without saving to DB.
            </p>
            <button type="button" onClick={() => { setAbMode(!abMode); setAbResultA(null); setAbResultB(null); }}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                abMode
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}>
              <ToggleLeft size={14} />
              A/B Compare
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Event Type</label>
              <select className={inputClass} value={previewEvent}
                onChange={e => setPreviewEvent(e.target.value)}>
                {EVENT_TYPES.map(et => (
                  <option key={et} value={et}>{EVENT_LABELS[et] ?? et}</option>
                ))}
              </select>
            </div>
            {!abMode ? (
              <div>
                <label className={labelClass}>Persona Override</label>
                <select className={inputClass} value={previewPersona}
                  onChange={e => setPreviewPersona(e.target.value)}>
                  <option value="">Auto (from triggers)</option>
                  {config.personas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Persona A</label>
                  <select className={inputClass} value={abPersonaA}
                    onChange={e => setAbPersonaA(e.target.value)}>
                    <option value="">Auto</option>
                    {config.personas.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Persona B</label>
                  <select className={inputClass} value={abPersonaB}
                    onChange={e => setAbPersonaB(e.target.value)}>
                    <option value="">Auto</option>
                    {config.personas.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Player</label>
              <input className={inputClass} value={previewPlayer}
                onChange={e => setPreviewPlayer(e.target.value)} />
            </div>
            {!abMode && (
              <div>
                <label className={labelClass}>Opponent</label>
                <input className={inputClass} value={previewOpponent}
                  onChange={e => setPreviewOpponent(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {abMode && (
              <div>
                <label className={labelClass}>Opponent</label>
                <input className={inputClass} value={previewOpponent}
                  onChange={e => setPreviewOpponent(e.target.value)} />
              </div>
            )}
            <div>
              <label className={labelClass}>Amount (AXM)</label>
              <input type="number" className={inputClass} value={previewAmount}
                onChange={e => setPreviewAmount(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Streak</label>
              <input type="number" className={inputClass} value={previewStreak}
                onChange={e => setPreviewStreak(Number(e.target.value))} min={0} />
            </div>
            <div>
              <label className={labelClass}>Side</label>
              <select className={inputClass} value={previewSide}
                onChange={e => setPreviewSide(e.target.value)}>
                <option value="heads">Heads</option>
                <option value="tails">Tails</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Chat Message</label>
              <input className={inputClass} value={previewChat}
                onChange={e => setPreviewChat(e.target.value)}
                placeholder="For chat_reply..." />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ActionButton onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {abMode ? 'Generate A/B' : 'Generate Preview'}
            </ActionButton>
            {!abMode && previewResult && (
              <button type="button" onClick={() => setShowRawPrompt(!showRawPrompt)}
                className="text-[10px] text-[var(--color-text-secondary)] hover:underline">
                {showRawPrompt ? 'Hide' : 'Show'} raw prompts
              </button>
            )}
          </div>

          {/* Single preview result */}
          {!abMode && previewResult && (
            <div className="space-y-3">
              <div className={cardClass}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-indigo-400">
                    Persona: {previewResult.personaUsed ?? 'none'}
                  </span>
                </div>
                <p className="text-sm mb-1">
                  <span className="text-[10px] font-bold text-blue-400 mr-1">RU:</span>
                  {previewResult.ru}
                </p>
                <p className="text-sm">
                  <span className="text-[10px] font-bold text-red-400 mr-1">EN:</span>
                  {previewResult.en}
                </p>
              </div>

              {showRawPrompt && (
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>System Prompt Sent</label>
                    <pre className="text-[10px] font-mono bg-[var(--color-bg)] rounded-lg p-2 max-h-[200px] overflow-auto border border-[var(--color-border)] whitespace-pre-wrap">
                      {previewResult.systemPrompt}
                    </pre>
                  </div>
                  <div>
                    <label className={labelClass}>User Prompt Sent</label>
                    <pre className="text-[10px] font-mono bg-[var(--color-bg)] rounded-lg p-2 max-h-[150px] overflow-auto border border-[var(--color-border)] whitespace-pre-wrap">
                      {previewResult.userPrompt}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* A/B comparison results */}
          {abMode && (abResultA || abResultB) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Persona A */}
              <div className={`${cardClass} border-blue-500/30`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-blue-400 px-1.5 py-0.5 rounded bg-blue-500/10">A</span>
                  <span className="text-[10px] font-semibold text-indigo-400">
                    {abResultA?.personaUsed ?? 'none'}
                  </span>
                </div>
                {abResultA ? (
                  <>
                    <p className="text-sm mb-1">
                      <span className="text-[10px] font-bold text-blue-400 mr-1">RU:</span>
                      {abResultA.ru}
                    </p>
                    <p className="text-sm">
                      <span className="text-[10px] font-bold text-red-400 mr-1">EN:</span>
                      {abResultA.en}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)]">No result</p>
                )}
              </div>
              {/* Persona B */}
              <div className={`${cardClass} border-violet-500/30`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-violet-400 px-1.5 py-0.5 rounded bg-violet-500/10">B</span>
                  <span className="text-[10px] font-semibold text-indigo-400">
                    {abResultB?.personaUsed ?? 'none'}
                  </span>
                </div>
                {abResultB ? (
                  <>
                    <p className="text-sm mb-1">
                      <span className="text-[10px] font-bold text-blue-400 mr-1">RU:</span>
                      {abResultB.ru}
                    </p>
                    <p className="text-sm">
                      <span className="text-[10px] font-bold text-red-400 mr-1">EN:</span>
                      {abResultB.en}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)]">No result</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ HISTORY ═══ */}
      {subTab === 'history' && (
        <div className="space-y-4">
          {/* Commentary */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400" />
              Commentary (Ticker) — {commentary.length}
            </h4>
            {commentary.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)] py-4 text-center">No commentary yet</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-xl border border-[var(--color-border)] p-2 bg-[var(--color-surface)]">
                {commentary.map((c) => {
                  const itemKey = `c-${c.betId}-${c.createdAt}`;
                  const isExpanded = expandedHistoryItems.has(itemKey);
                  return (
                    <div key={itemKey} className="p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-medium text-indigo-400">#{c.betId}</span>
                        {c.eventType && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            {EVENT_LABELS[c.eventType] ?? c.eventType}
                          </span>
                        )}
                        {c.personaId && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
                            {config.personas.find(p => p.id === c.personaId)?.name ?? c.personaId}
                          </span>
                        )}
                        {c.wasRegenerated && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-semibold">
                            REGEN
                          </span>
                        )}
                        {c.similarityScore != null && (
                          <span className="text-[9px] tabular-nums text-[var(--color-text-secondary)]" title="Similarity score">
                            sim:{c.similarityScore.toFixed(2)}
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--color-text-secondary)]">{formatDate(c.createdAt)}</span>
                        {c.inputContext && (
                          <button type="button" onClick={() => toggleHistoryExpand(itemKey)}
                            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] ml-auto">
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        )}
                      </div>
                      <p className="text-xs mb-0.5"><span className="text-[10px] font-semibold text-blue-400">RU:</span> {c.textRu}</p>
                      <p className="text-xs"><span className="text-[10px] font-semibold text-red-400">EN:</span> {c.textEn}</p>
                      {isExpanded && c.inputContext && (
                        <pre className="mt-2 text-[9px] font-mono bg-[var(--color-surface)] rounded-lg p-2 max-h-[150px] overflow-auto border border-[var(--color-border)] whitespace-pre-wrap">
                          {JSON.stringify(c.inputContext, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat messages */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-violet-400" />
              Bot Chat Messages — {chatMessages.length}
            </h4>
            {chatMessages.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)] py-4 text-center">No bot chat messages yet</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-xl border border-[var(--color-border)] p-2 bg-[var(--color-surface)]">
                {chatMessages.map((m) => {
                  const itemKey = `m-${m.id}`;
                  const isExpanded = expandedHistoryItems.has(itemKey);
                  return (
                    <div key={m.id} className="p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] text-[var(--color-text-secondary)]">{formatDate(m.createdAt)}</span>
                        {m.wasRegenerated && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-semibold">
                            REGEN
                          </span>
                        )}
                        {m.similarityScore != null && (
                          <span className="text-[9px] tabular-nums text-[var(--color-text-secondary)]" title="Similarity score">
                            sim:{m.similarityScore.toFixed(2)}
                          </span>
                        )}
                        {m.inputContext && (
                          <button type="button" onClick={() => toggleHistoryExpand(itemKey)}
                            className="text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] ml-auto">
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text)] whitespace-pre-wrap">{m.message}</p>
                      {isExpanded && m.inputContext && (
                        <pre className="mt-2 text-[9px] font-mono bg-[var(--color-surface)] rounded-lg p-2 max-h-[150px] overflow-auto border border-[var(--color-border)] whitespace-pre-wrap">
                          {JSON.stringify(m.inputContext, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ANALYTICS ═══ */}
      {subTab === 'analytics' && stats && (
        <div className="space-y-4">
          {/* Overview stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={`${cardClass} text-center`}>
              <div className="text-xl font-bold tabular-nums text-indigo-400">{stats.totalCommentary}</div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Commentary</div>
            </div>
            <div className={`${cardClass} text-center`}>
              <div className="text-xl font-bold tabular-nums text-violet-400">{stats.totalChatMessages}</div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Chat Msgs</div>
            </div>
            <div className={`${cardClass} text-center`}>
              <div className="text-sm font-medium tabular-nums">{timeAgo(stats.lastCommentaryAt)}</div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Last Comment</div>
            </div>
            <div className={`${cardClass} text-center`}>
              <div className="text-sm font-medium tabular-nums">{timeAgo(stats.lastChatMessageAt)}</div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Last Chat</div>
            </div>
          </div>

          {/* New stats: avg length and regen rate */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`${cardClass} text-center`}>
              <div className="text-xl font-bold tabular-nums text-cyan-400">
                {stats.avgLength != null ? Math.round(stats.avgLength) : '—'}
              </div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Avg Length (chars)</div>
            </div>
            <div className={`${cardClass} text-center`}>
              <div className="text-xl font-bold tabular-nums text-orange-400">
                {stats.regenRate != null ? `${(stats.regenRate * 100).toFixed(1)}%` : '—'}
              </div>
              <div className="text-[9px] text-[var(--color-text-secondary)] uppercase">Regen Rate</div>
            </div>
          </div>

          {/* By Event Type */}
          {Object.keys(stats.commentaryByEvent).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Commentary by Event Type</h4>
              <div className={cardClass}>
                <div className="space-y-1.5">
                  {Object.entries(stats.commentaryByEvent)
                    .sort(([, a], [, b]) => b - a)
                    .map(([et, cnt]) => {
                      const total = stats.totalCommentary || 1;
                      const pct = Math.round((cnt / total) * 100);
                      return (
                        <div key={et} className="flex items-center gap-2">
                          <span className="text-[11px] font-medium w-28 shrink-0">{EVENT_LABELS[et] ?? et}</span>
                          <div className="flex-1 h-3 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500/60" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums font-bold w-10 text-right">{cnt}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* By Persona */}
          {Object.keys(stats.commentaryByPersona).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Commentary by Persona</h4>
              <div className={cardClass}>
                <div className="space-y-1.5">
                  {Object.entries(stats.commentaryByPersona)
                    .sort(([, a], [, b]) => b - a)
                    .map(([pid, cnt]) => {
                      const persona = config.personas.find(p => p.id === pid);
                      const total = stats.totalCommentary || 1;
                      const pct = Math.round((cnt / total) * 100);
                      return (
                        <div key={pid} className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 w-36 shrink-0">
                            {persona?.color && (
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: persona.color }} />
                            )}
                            <span className="text-[11px] font-medium truncate">{persona?.name ?? pid}</span>
                          </div>
                          <div className="flex-1 h-3 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums font-bold w-10 text-right">{cnt}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Persona Usage bar chart */}
          {stats.personaUsage && Object.keys(stats.personaUsage).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Persona Usage (all outputs)</h4>
              <div className={cardClass}>
                <div className="space-y-1.5">
                  {Object.entries(stats.personaUsage)
                    .sort(([, a], [, b]) => b - a)
                    .map(([pid, cnt]) => {
                      const persona = config.personas.find(p => p.id === pid);
                      const maxVal = Math.max(...Object.values(stats.personaUsage), 1);
                      const pct = Math.round((cnt / maxVal) * 100);
                      return (
                        <div key={pid} className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 w-36 shrink-0">
                            {persona?.color && (
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: persona.color }} />
                            )}
                            <span className="text-[11px] font-medium truncate">{persona?.name ?? pid}</span>
                          </div>
                          <div className="flex-1 h-3 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums font-bold w-10 text-right">{cnt}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ACTIONS ═══ */}
      {subTab === 'actions' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">Dangerous actions. Deletions cannot be undone.</p>

          {actionResult && (
            <div className="text-sm font-medium text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
              {actionResult}
            </div>
          )}

          <div className={dangerCardClass}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <h4 className="text-sm font-semibold text-amber-400">Reset to Defaults</h4>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Loads default system prompt, all 12 personas, and trigger mappings.
              Click &quot;Save&quot; after to apply.
            </p>
            <button type="button" onClick={handleResetDefaults}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
              {actionLoading === 'reset' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Load Defaults
            </button>
          </div>

          <div className={dangerCardClass}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <h4 className="text-sm font-semibold text-red-400">Clear All Commentary</h4>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Deletes all ticker commentary.
              {stats && stats.totalCommentary > 0 && <span className="font-medium text-[var(--color-text)]"> ({stats.totalCommentary} entries)</span>}
            </p>
            <button type="button" onClick={handleClearCommentary} disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              {actionLoading === 'commentary' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Commentary
            </button>
          </div>

          <div className={dangerCardClass}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <h4 className="text-sm font-semibold text-red-400">Clear All Bot Chat Messages</h4>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Deletes all bot messages from global chat.
              {stats && stats.totalChatMessages > 0 && <span className="font-medium text-[var(--color-text)]"> ({stats.totalChatMessages} messages)</span>}
            </p>
            <button type="button" onClick={handleClearChat} disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              {actionLoading === 'chat' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Chat Messages
            </button>
          </div>

          <div className={dangerCardClass.replace('red-500/20', 'red-500/30')}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500" />
              <h4 className="text-sm font-semibold text-red-500">Nuclear: Clear Everything</h4>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">Deletes ALL bot content.</p>
            <button type="button" disabled={actionLoading !== null}
              onClick={async () => {
                if (!confirm('Delete ALL bot content? Cannot be undone!')) return;
                setActionLoading('nuclear');
                setActionResult(null);
                try {
                  const [c, m] = await Promise.all([clearCommentaryApi(), clearChatMessagesApi()]);
                  setActionResult(`Deleted ${c} commentary + ${m} chat messages`);
                  setCommentary([]); setChatMessages([]);
                  setStats(await fetchStats());
                } catch { setActionResult('Error'); }
                finally { setActionLoading(null); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 disabled:opacity-50 transition-colors">
              {actionLoading === 'nuclear' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Persona Card ───────────────────────────────────────

function PersonaCard({
  persona: p,
  isActive,
  onUpdate,
  onClone,
  onRemove,
  onSetActive,
}: {
  persona: Persona;
  isActive: boolean;
  onUpdate: (field: string, value: unknown) => void;
  onClone: () => void;
  onRemove: () => void;
  onSetActive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const enabled = p.enabled !== false;
  const hasSchedule = p.schedule && (p.schedule.days?.length || p.schedule.startHour != null || p.schedule.endHour != null);

  const updateSchedule = (field: keyof PersonaSchedule, value: unknown) => {
    const current = p.schedule ?? {};
    onUpdate('schedule', { ...current, [field]: value });
  };

  const toggleScheduleDay = (day: number) => {
    const current = p.schedule?.days ?? [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort();
    updateSchedule('days', next);
  };

  return (
    <div className={`rounded-xl border ${isActive ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'} overflow-hidden`}>
      {/* Header — always visible */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {p.avatarUrl ? (
          <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color ?? '#6366f1' }} />
        )}
        <span className={`text-sm font-medium flex-1 ${!enabled ? 'opacity-40' : ''}`}>
          {p.name}
          {p.displayName && (
            <span className="ml-1.5 text-[10px] font-normal" style={{ color: p.nameColor ?? 'var(--color-text-secondary)' }}>
              ({p.displayName})
            </span>
          )}
        </span>
        {isActive && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-semibold">
            ACTIVE
          </span>
        )}
        {!enabled && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text-secondary)] font-semibold">
            OFF
          </span>
        )}
        {hasSchedule && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
            Scheduled
          </span>
        )}
        {p.description && (
          <span className="text-[10px] text-[var(--color-text-secondary)] hidden sm:inline truncate max-w-[200px]">
            {p.description}
          </span>
        )}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-border)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} value={p.name}
                onChange={e => onUpdate('name', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input className={inputClass} value={p.slug ?? ''}
                onChange={e => onUpdate('slug', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={p.color ?? '#6366f1'}
                  onChange={e => onUpdate('color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-none" />
                <span className="text-[10px] text-[var(--color-text-secondary)]">{p.color ?? '#6366f1'}</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <input type="number" className={inputClass} value={p.priority ?? 0}
                onChange={e => onUpdate('priority', Number(e.target.value))} min={0} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className={labelClass}>Display Name (chat)</label>
              <input className={inputClass} value={p.displayName ?? ''}
                onChange={e => onUpdate('displayName', e.target.value)}
                placeholder="Name in chat..." />
            </div>
            <div>
              <label className={labelClass}>Avatar URL</label>
              <input className={inputClass} value={p.avatarUrl ?? ''}
                onChange={e => onUpdate('avatarUrl', e.target.value)}
                placeholder="https://..." />
            </div>
            <div>
              <label className={labelClass}>Nick Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={p.nameColor ?? '#ffffff'}
                  onChange={e => onUpdate('nameColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-none" />
                <span className="text-[10px] text-[var(--color-text-secondary)]">{p.nameColor ?? '#ffffff'}</span>
              </div>
            </div>
          </div>

          {p.avatarUrl && (
            <div className="flex items-center gap-2">
              <img src={p.avatarUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover border border-[var(--color-border)]" />
              <span className="text-[10px] text-[var(--color-text-secondary)]">Preview</span>
            </div>
          )}

          <div>
            <label className={labelClass}>Description</label>
            <input className={inputClass} value={p.description ?? ''}
              onChange={e => onUpdate('description', e.target.value)}
              placeholder="Short description of this persona..." />
          </div>

          <div>
            <label className={labelClass}>Prompt Overlay</label>
            <textarea className={`${inputClass} h-32 resize-y text-xs`}
              value={p.prompt}
              onChange={e => onUpdate('prompt', e.target.value)}
              placeholder="Style overlay prompt..." />
          </div>

          {/* ── Schedule Section ── */}
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <button type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={(e) => { e.stopPropagation(); setScheduleOpen(!scheduleOpen); }}>
              <Calendar size={12} className="text-cyan-400" />
              Schedule
              {hasSchedule && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold ml-auto mr-2">
                  Active
                </span>
              )}
              {scheduleOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {scheduleOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[var(--color-border)]">
                {/* Day checkboxes */}
                <div>
                  <label className={labelClass}>Active Days</label>
                  <div className="flex gap-1">
                    {DAY_LABELS.map((label, i) => {
                      const active = (p.schedule?.days ?? []).includes(i);
                      return (
                        <button key={i} type="button"
                          onClick={(e) => { e.stopPropagation(); toggleScheduleDay(i); }}
                          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                            active
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Hours */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Start Hour (0-23)</label>
                    <select className={inputClass} value={p.schedule?.startHour ?? ''}
                      onChange={e => updateSchedule('startHour', e.target.value === '' ? undefined : Number(e.target.value))}>
                      <option value="">Any</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>End Hour (0-23)</label>
                    <select className={inputClass} value={p.schedule?.endHour ?? ''}
                      onChange={e => updateSchedule('endHour', e.target.value === '' ? undefined : Number(e.target.value))}>
                      <option value="">Any</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Timezone */}
                <div>
                  <label className={labelClass}>Timezone</label>
                  <input className={inputClass} value={p.schedule?.timezone ?? ''}
                    onChange={e => updateSchedule('timezone', e.target.value || undefined)}
                    placeholder="UTC, Europe/Moscow, etc." />
                </div>
                {/* Clear schedule */}
                {hasSchedule && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); onUpdate('schedule', undefined); }}
                    className="flex items-center gap-1 text-[10px] text-red-400 hover:underline">
                    <X size={10} /> Clear Schedule
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onUpdate('enabled', !enabled)}
                className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                  enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}>
                {enabled ? 'Enabled' : 'Disabled'}
              </button>
              {!isActive && (
                <button type="button" onClick={onSetActive}
                  className="text-[10px] font-medium px-2 py-1 rounded-md text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 transition-colors">
                  Set Active
                </button>
              )}
              <button type="button" onClick={onClone}
                className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
                <Copy size={10} /> Clone
              </button>
            </div>
            <button type="button" onClick={onRemove}
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
