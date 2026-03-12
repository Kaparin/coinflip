import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { wsService } from './ws.service.js';

// ─── Types ──────────────────────────────────────────────

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
  schedule?: { days?: number[]; startHour?: number; endHour?: number; timezone?: string };
}

interface TriggerMapping {
  eventType: string;
  personaId: string | null;
  enabled: boolean;
  cooldownSec?: number;
  minBetThreshold?: number;
  probability?: number;
}

type SafetyMode = 'strict' | 'playful' | 'safe_chat' | 'event_only' | 'chat_read_only';

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
  // Style controls
  temperature: number;
  emojiIntensity: number;
  humorLevel: number;
  dramaLevel: number;
  sarcasmLevel: number;
  premiumLevel: number;
  fairnessMentions: boolean;
  profanityFilter: boolean;
  // Safety
  safetyMode: SafetyMode;
  bannedPhrases: string[];
  softBannedPatterns: string[];
}

interface BetContext {
  betId: string;
  makerNickname: string;
  acceptorNickname: string;
  amount: string;
  winnerNickname: string;
  loserNickname: string;
  side: string;
  winnerSide: string;
  payoutAmount: string;
}

type EventType =
  | 'bet_comment'
  | 'big_bet'
  | 'huge_bet'
  | 'win_comment'
  | 'loss_comment'
  | 'streak_comment'
  | 'upset_comment'
  | 'chat_reply'
  | 'fairness_reply'
  | 'silence'
  | 'jackpot'
  | 'system_announcement';

interface EventPayload {
  event: EventType;
  player?: string;
  opponent?: string;
  side?: string;
  amount?: number;
  token?: string;
  streak?: number;
  result?: string;
  isUpset?: boolean;
  chatMessage?: string;
  winAmount?: string;
  lossAmount?: string;
}

interface ChatTriggerContext {
  type: 'mention' | 'big_bet' | 'streak' | 'silence' | 'jackpot';
  message?: string;
  userNickname?: string;
  betAmount?: string;
  streakCount?: number;
  jackpotAmount?: string;
  jackpotWinner?: string;
}

interface PhraseRule {
  id: string;
  type: 'blacklist' | 'cooldown' | 'preferred' | 'forbidden_opening';
  value: string;
  cooldownSec?: number;
  isEnabled: boolean;
}

interface PlayerContext {
  lastResult: 'win' | 'loss';
  lastStreak: number;
  lastAmount: number;
  lastSeen: number;
  totalBets: number;
}

interface GenerationMeta {
  wasRegenerated: boolean;
  similarityScore: number | null;
  inputContext: EventPayload | null;
}

// ─── Default system prompt (from TZ) ────────────────

const DEFAULT_SYSTEM_PROMPT = `You are the live host of CoinFlip on Axiome blockchain.

Core role:
- Comment on bets, wins, losses, streaks, surprises, chat moments, and major table events
- Make the game feel alive, dramatic, playful, and premium
- Sound confident, sharp, entertaining, and socially aware

Hard rules:
- Always return STRICT valid JSON only
- Output format must always be: {"ru":"...","en":"..."}
- Never output markdown
- Never output code fences
- Never output explanations
- Never output extra keys
- Maximum 2 short sentences per language
- Keep Russian and English equal in energy, not necessarily word-for-word
- Use 0-2 emojis max when they genuinely improve the line
- Never give financial advice
- Never seriously predict outcomes
- Never guarantee wins
- Never encourage reckless gambling
- Never insult players harshly
- Never become toxic, political, hateful, sexual, or overly offensive
- NEVER translate player nicknames — keep them exactly as provided in both ru and en

Game facts:
- Players bet AXM on heads or tails
- Winner gets 2x stake minus a 10% commission
- CoinFlip uses commit-reveal and is provably fair

Style baseline:
- Sharp
- Memorable
- Arena-like
- Slightly dramatic
- Light humor welcome
- Never robotic
- Never generic
- Never repetitive

Reaction priorities:
- Big bets should feel important
- Win streaks should feel legendary
- Upsets should feel explosive
- Losses should feel tense but playful
- Chat replies should feel witty and quick

Anti-repetition:
- Avoid repeating the same sentence structure, same catchphrases, and same metaphors too often
- Vary openings, rhythm, and punchlines
- Prefer short, vivid lines over generic commentary

Persona rule:
- If an active persona overlay exists, follow its tone and flavor
- Persona changes style only, never the JSON format, hard rules, or game facts`;

// ─── Default Personas ───────────────────────────────────

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'oracle_classic',
    name: 'Oracle Classic',
    slug: 'oracle-classic',
    description: 'Default charismatic arena host — premium, dark, confident',
    prompt: `You are the classic CoinFlip Oracle.\n\nStyle:\n- Charismatic, slick, sharp, confident\n- Sound like an elite arena host with a playful smile\n- Build hype without sounding loud or clownish\n- Short punchy reactions\n- Light irony is welcome\n- Make big bets feel important and streaks feel dangerous\n- Keep the vibe premium, dark, stylish, and exciting`,
    enabled: true, priority: 1, color: '#6366f1',
    displayName: 'Oracle', nameColor: '#6366f1',
  },
  {
    id: 'street_hype',
    name: 'Street Hype',
    slug: 'street-hype',
    description: 'Fast, bold underground commentator with swagger',
    prompt: `You are the street-energy version of the CoinFlip Oracle.\n\nStyle:\n- Fast, cheeky, lively, bold\n- Sound like a sharp underground commentator with swagger\n- Use playful street confidence, but stay clean and readable\n- Reactions should feel immediate and punchy\n- Celebrate guts, momentum, and audacity\n- Never become rude, dumb, or overly slang-heavy`,
    enabled: true, priority: 2, color: '#f59e0b',
    displayName: 'Hype', nameColor: '#f59e0b',
  },
  {
    id: 'midnight_showman',
    name: 'Midnight Showman',
    slug: 'midnight-showman',
    description: 'Smooth, witty late-night host with polished irony',
    prompt: `You are the late-night showman version of the CoinFlip Oracle.\n\nStyle:\n- Smooth, witty, charming, theatrical\n- Sound like a stylish host enjoying every twist at the table\n- Use clever light humor and polished irony\n- Reactions should feel elegant, playful, and camera-ready\n- Big moments should feel like prime-time television`,
    enabled: true, priority: 3, color: '#8b5cf6',
    displayName: 'Showman', nameColor: '#8b5cf6',
  },
  {
    id: 'deadpan_comedian',
    name: 'Deadpan Comedian',
    slug: 'deadpan-comedian',
    description: 'Dry humor, understated sarcasm, subtle punchlines',
    prompt: `You are the deadpan comedian version of the CoinFlip Oracle.\n\nStyle:\n- Dry, smart, understated, sarcastic in a clean way\n- Sound amused, never chaotic\n- Use subtle punchlines and low-key dramatic irony\n- Great for losses, awkward swings, and surprise flips\n- Never become mean or humiliating`,
    enabled: true, priority: 4, color: '#64748b',
    displayName: 'Comedian', nameColor: '#64748b',
  },
  {
    id: 'imperial_herald',
    name: 'Imperial Herald',
    slug: 'imperial-herald',
    description: 'Grand ceremonial announcer for high-stakes moments',
    prompt: `You are the imperial herald version of the CoinFlip Oracle.\n\nStyle:\n- Grand, ceremonial, majestic\n- Sound like the announcer of a high-stakes royal arena\n- Treat major bets like decrees and streaks like campaigns\n- Use elevated dramatic language, but keep it compact\n- Never sound ancient or hard to understand`,
    enabled: true, priority: 5, color: '#dc2626',
    displayName: 'Herald', nameColor: '#dc2626',
  },
  {
    id: 'mystic_volhv',
    name: 'Mystic Volhv',
    slug: 'mystic-volhv',
    description: 'Cryptic seer watching fate spin — omens and destiny',
    prompt: `You are the mystic oracle version of the CoinFlip Oracle.\n\nStyle:\n- Cryptic, dramatic, atmospheric\n- Sound like a seer watching fate spin in public\n- Use mystery, omens, tension, and destiny flavor\n- Fairness can be framed as ritual precision and revealed truth\n- Never become too obscure or poetic to the point of confusion`,
    enabled: true, priority: 6, color: '#7c3aed',
    displayName: 'Volhv', nameColor: '#7c3aed',
  },
  {
    id: 'sports_fury',
    name: 'Sports Fury',
    slug: 'sports-fury',
    description: 'Energetic sports commentator calling clutch moments',
    prompt: `You are the sports commentator version of the CoinFlip Oracle.\n\nStyle:\n- Energetic, reactive, focused, explosive\n- Sound like a high-level commentator calling a clutch moment live\n- Emphasize momentum, pressure, comeback energy, and streak heat\n- Keep reactions immediate and competitive\n- Never overexplain the obvious`,
    enabled: true, priority: 7, color: '#16a34a',
    displayName: 'Fury', nameColor: '#16a34a',
  },
  {
    id: 'rap_mc',
    name: 'Rap MC',
    slug: 'rap-mc',
    description: 'Rhythmic battle-night host with flow and confidence',
    prompt: `You are the rap-MC version of the CoinFlip Oracle.\n\nStyle:\n- Rhythmic, bold, stylish, playful\n- Sound like a battle-night host with flow and confidence\n- Use compact swagger and cadence, not forced rhymes\n- Make major flips feel like drops, clashes, and statements\n- Never become corny, childish, or overly lyrical`,
    enabled: false, priority: 8, color: '#ea580c',
    displayName: 'MC', nameColor: '#ea580c',
  },
  {
    id: 'velvet_diva',
    name: 'Velvet Diva',
    slug: 'velvet-diva',
    description: 'Glamorous, sharp, flamboyant drama without trash',
    prompt: `You are the glam-diva version of the CoinFlip Oracle.\n\nStyle:\n- Flamboyant, glamorous, sharp, dramatic\n- Sound amused, confident, and beautifully judgmental without cruelty\n- Big bets should feel luxurious and dangerous\n- Use stylish, polished, witty phrasing\n- Never become rude, shrill, or too campy`,
    enabled: false, priority: 9, color: '#ec4899',
    displayName: 'Diva', nameColor: '#ec4899',
  },
  {
    id: 'boss_uncle',
    name: 'Boss Uncle',
    slug: 'boss-uncle',
    description: 'Calm veteran with seasoned authority and amusement',
    prompt: `You are the boss-uncle version of the CoinFlip Oracle.\n\nStyle:\n- Calm, seasoned, amused, dominant\n- Sound like someone who has seen chaos before and still enjoys it\n- Use short confident reactions with veteran energy\n- Praise nerve, mock panic lightly, respect bold moves\n- Never become preachy or boomer-like`,
    enabled: false, priority: 10, color: '#78716c',
    displayName: 'Boss', nameColor: '#78716c',
  },
  {
    id: 'luxury_casino_host',
    name: 'Luxury Casino Host',
    slug: 'luxury-casino-host',
    description: 'Refined high-stakes room master — prestige and cool',
    prompt: `You are the luxury casino host version of the CoinFlip Oracle.\n\nStyle:\n- Refined, expensive, poised, polished\n- Sound like the master of a private high-stakes room\n- Big bets should feel prestigious and dangerous\n- Use elegant phrasing, cool confidence, and subtle flair\n- Never sound generic, cheesy, or too formal`,
    enabled: true, priority: 11, color: '#b45309',
    displayName: 'Casino Host', nameColor: '#b45309',
  },
  {
    id: 'chaos_lite',
    name: 'Chaos Lite',
    slug: 'chaos-lite',
    description: 'Playful mischief and hype — fun without going unhinged',
    prompt: `You are the chaotic-fun version of the CoinFlip Oracle.\n\nStyle:\n- Fast, playful, mischievous, hype-heavy\n- Sound like the room got louder after the bet landed\n- Use compact dramatic reactions with a grin\n- Great for upsets, streak breaks, and chat sparks\n- Never become spammy, cringe, or fully unhinged`,
    enabled: false, priority: 12, color: '#0ea5e9',
    displayName: 'Chaos', nameColor: '#0ea5e9',
  },
];

// ─── Default Trigger Mappings ───────────────────────────

const DEFAULT_TRIGGER_MAPPINGS: TriggerMapping[] = [
  { eventType: 'bet_comment', personaId: 'oracle_classic', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
  { eventType: 'big_bet', personaId: 'imperial_herald', enabled: true, cooldownSec: 30, minBetThreshold: 500, probability: 100 },
  { eventType: 'huge_bet', personaId: 'luxury_casino_host', enabled: true, cooldownSec: 30, minBetThreshold: 2000, probability: 100 },
  { eventType: 'win_comment', personaId: 'sports_fury', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
  { eventType: 'loss_comment', personaId: 'deadpan_comedian', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
  { eventType: 'streak_comment', personaId: 'street_hype', enabled: true, cooldownSec: 60, minBetThreshold: 0, probability: 100 },
  { eventType: 'upset_comment', personaId: 'chaos_lite', enabled: true, cooldownSec: 30, minBetThreshold: 0, probability: 100 },
  { eventType: 'chat_reply', personaId: 'midnight_showman', enabled: true, cooldownSec: 30, minBetThreshold: 0, probability: 100 },
  { eventType: 'fairness_reply', personaId: 'mystic_volhv', enabled: true, cooldownSec: 60, minBetThreshold: 0, probability: 100 },
  { eventType: 'silence', personaId: 'oracle_classic', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
  { eventType: 'jackpot', personaId: 'imperial_herald', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
  { eventType: 'system_announcement', personaId: 'oracle_classic', enabled: true, cooldownSec: 0, minBetThreshold: 0, probability: 100 },
];

// ─── Anti-repeat ring buffer ────────────────────────────

class RecentPhrasesBuffer {
  private buffer: string[] = [];
  private maxSize: number;

  constructor(maxSize = 30) {
    this.maxSize = maxSize;
  }

  add(phrase: string) {
    this.buffer.push(phrase.toLowerCase().trim());
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  isTooSimilar(phrase: string): { similar: boolean; score: number } {
    const normalized = phrase.toLowerCase().trim();
    const words = new Set(normalized.split(/\s+/));
    let maxScore = 0;

    for (const recent of this.buffer) {
      if (recent === normalized) return { similar: true, score: 1.0 };

      const recentWords = new Set(recent.split(/\s+/));
      const intersection = [...words].filter(w => recentWords.has(w)).length;
      const union = new Set([...words, ...recentWords]).size;
      const score = union > 0 ? intersection / union : 0;
      if (score > maxScore) maxScore = score;
      if (score > 0.7) return { similar: true, score };

      const newOpening = normalized.split(/\s+/).slice(0, 5).join(' ');
      const recentOpening = recent.split(/\s+/).slice(0, 5).join(' ');
      if (newOpening.length > 10 && newOpening === recentOpening) return { similar: true, score: 0.8 };
    }

    return { similar: false, score: maxScore };
  }

  getRecent(n = 5): string[] {
    return this.buffer.slice(-n);
  }

  clear() {
    this.buffer = [];
  }

  setMaxSize(size: number) {
    this.maxSize = size;
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }
}

// ─── Player Memory (LRU, in-memory) ─────────────────────

class PlayerMemory {
  private map = new Map<string, PlayerContext>();
  private maxSize = 200;

  update(nickname: string, result: 'win' | 'loss', amount: number, streak: number) {
    const existing = this.map.get(nickname);
    this.map.delete(nickname); // re-insert at end for LRU
    this.map.set(nickname, {
      lastResult: result,
      lastStreak: streak,
      lastAmount: amount,
      lastSeen: Date.now(),
      totalBets: (existing?.totalBets ?? 0) + 1,
    });
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
  }

  get(nickname: string): PlayerContext | undefined {
    return this.map.get(nickname);
  }
}

// ─── Service ────────────────────────────────────────────

class AiBotService {
  private db = getDb();
  private config: BotConfig | null = null;
  private configLoadedAt = 0;
  private lastChatMessageAt = 0;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private botUserId: string | null = null;
  private recentPhrases = new RecentPhrasesBuffer(30);
  private lastTriggerTimes = new Map<string, number>();
  private phraseRules: PhraseRule[] = [];
  private phraseRulesLoadedAt = 0;
  private phraseLastUsed = new Map<string, number>(); // ruleId -> timestamp
  private playerMemory = new PlayerMemory();

  // ─── Config ─────────────────────────────────────────

  async getConfig(): Promise<BotConfig> {
    const now = Date.now();
    if (this.config && now - this.configLoadedAt < 60_000) {
      return this.config;
    }

    const rows = await this.db.execute(sql`SELECT * FROM ai_bot_config LIMIT 1`);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length === 0) {
      await this.db.execute(sql`
        INSERT INTO ai_bot_config (system_prompt, personas, trigger_mappings)
        VALUES (${DEFAULT_SYSTEM_PROMPT}, ${JSON.stringify(DEFAULT_PERSONAS)}::jsonb, ${JSON.stringify(DEFAULT_TRIGGER_MAPPINGS)}::jsonb)
        ON CONFLICT DO NOTHING
      `);
      this.config = this.buildDefaultConfig();
    } else {
      const r = rawRows[0]!;
      this.config = {
        commentaryEnabled: r.commentary_enabled === true,
        chatBotEnabled: r.chat_bot_enabled === true,
        botName: String(r.bot_name ?? 'Oracle'),
        systemPrompt: String(r.system_prompt ?? DEFAULT_SYSTEM_PROMPT),
        personas: Array.isArray(r.personas) ? r.personas as Persona[] : DEFAULT_PERSONAS,
        activePersonaId: r.active_persona_id ? String(r.active_persona_id) : null,
        model: String(r.model ?? 'gpt-4o-mini'),
        chatCooldownSec: Number(r.chat_cooldown_sec ?? 30),
        bigBetThreshold: Number(r.big_bet_threshold ?? 500),
        streakThreshold: Number(r.streak_threshold ?? 3),
        silenceMinutes: Number(r.silence_minutes ?? 120),
        respondToMentions: r.respond_to_mentions === true,
        reactToBigBets: r.react_to_big_bets === true,
        reactToStreaks: r.react_to_streaks === true,
        postOnSilence: r.post_on_silence === true,
        extraContext: String(r.extra_context ?? ''),
        triggerMappings: Array.isArray(r.trigger_mappings) ? r.trigger_mappings as TriggerMapping[] : DEFAULT_TRIGGER_MAPPINGS,
        antiRepeatCount: Number(r.anti_repeat_count ?? 30),
        safetyStrict: r.safety_strict === true,
        temperature: Number(r.temperature ?? 0.95),
        emojiIntensity: Number(r.emoji_intensity ?? 1),
        humorLevel: Number(r.humor_level ?? 3),
        dramaLevel: Number(r.drama_level ?? 3),
        sarcasmLevel: Number(r.sarcasm_level ?? 2),
        premiumLevel: Number(r.premium_level ?? 3),
        fairnessMentions: r.fairness_mentions !== false,
        profanityFilter: r.profanity_filter !== false,
        safetyMode: (String(r.safety_mode ?? 'safe_chat')) as SafetyMode,
        bannedPhrases: Array.isArray(r.banned_phrases) ? r.banned_phrases as string[] : [],
        softBannedPatterns: Array.isArray(r.soft_banned_patterns) ? r.soft_banned_patterns as string[] : [],
      };
    }

    this.configLoadedAt = now;
    this.recentPhrases.setMaxSize(this.config.antiRepeatCount);
    return this.config;
  }

  private buildDefaultConfig(): BotConfig {
    return {
      commentaryEnabled: true, chatBotEnabled: true, botName: 'Oracle',
      systemPrompt: DEFAULT_SYSTEM_PROMPT, personas: DEFAULT_PERSONAS,
      activePersonaId: 'oracle_classic', model: 'gpt-4o-mini',
      chatCooldownSec: 30, bigBetThreshold: 500, streakThreshold: 3,
      silenceMinutes: 120, respondToMentions: true, reactToBigBets: true,
      reactToStreaks: true, postOnSilence: true, extraContext: '',
      triggerMappings: DEFAULT_TRIGGER_MAPPINGS, antiRepeatCount: 30,
      safetyStrict: false, temperature: 0.95, emojiIntensity: 1,
      humorLevel: 3, dramaLevel: 3, sarcasmLevel: 2, premiumLevel: 3,
      fairnessMentions: true, profanityFilter: true, safetyMode: 'safe_chat',
      bannedPhrases: [], softBannedPatterns: [],
    };
  }

  invalidateConfig() {
    this.configLoadedAt = 0;
    this.config = null;
  }

  // ─── Phrase Rules ────────────────────────────────────

  async loadPhraseRules(): Promise<PhraseRule[]> {
    const now = Date.now();
    if (this.phraseRules.length > 0 && now - this.phraseRulesLoadedAt < 60_000) {
      return this.phraseRules;
    }
    try {
      const rows = await this.db.execute(sql`SELECT id::text, type, value, cooldown_sec, is_enabled FROM phrase_rules WHERE is_enabled = true`);
      const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
      this.phraseRules = rawRows.map(r => ({
        id: String(r.id),
        type: String(r.type) as PhraseRule['type'],
        value: String(r.value),
        cooldownSec: r.cooldown_sec ? Number(r.cooldown_sec) : undefined,
        isEnabled: true,
      }));
    } catch {
      this.phraseRules = [];
    }
    this.phraseRulesLoadedAt = now;
    return this.phraseRules;
  }

  invalidatePhraseRules() {
    this.phraseRulesLoadedAt = 0;
  }

  private checkPhraseRules(text: string): { passed: boolean; reason?: string } {
    const lower = text.toLowerCase();

    for (const rule of this.phraseRules) {
      if (rule.type === 'blacklist') {
        if (lower.includes(rule.value.toLowerCase())) {
          return { passed: false, reason: `blacklisted: "${rule.value}"` };
        }
      }
      if (rule.type === 'forbidden_opening') {
        const opening = lower.split(/\s+/).slice(0, 6).join(' ');
        if (opening.startsWith(rule.value.toLowerCase())) {
          return { passed: false, reason: `forbidden opening: "${rule.value}"` };
        }
      }
      if (rule.type === 'cooldown' && rule.cooldownSec) {
        const lastUsed = this.phraseLastUsed.get(rule.id) ?? 0;
        if (lower.includes(rule.value.toLowerCase()) && Date.now() - lastUsed < rule.cooldownSec * 1000) {
          return { passed: false, reason: `cooldown phrase: "${rule.value}"` };
        }
      }
    }

    return { passed: true };
  }

  private recordPhraseUsage(text: string) {
    const lower = text.toLowerCase();
    for (const rule of this.phraseRules) {
      if (rule.type === 'cooldown' && lower.includes(rule.value.toLowerCase())) {
        this.phraseLastUsed.set(rule.id, Date.now());
      }
    }
  }

  private getPreferredPhrases(): string[] {
    return this.phraseRules
      .filter(r => r.type === 'preferred')
      .map(r => r.value);
  }

  // ─── CRUD for phrase rules ──────────────────────────

  async getPhraseRules(): Promise<PhraseRule[]> {
    const rows = await this.db.execute(sql`SELECT id::text, type, value, cooldown_sec, is_enabled FROM phrase_rules ORDER BY type, created_at`);
    return ((Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      type: String(r.type) as PhraseRule['type'],
      value: String(r.value),
      cooldownSec: r.cooldown_sec ? Number(r.cooldown_sec) : undefined,
      isEnabled: r.is_enabled === true,
    }));
  }

  async createPhraseRule(type: string, value: string, cooldownSec?: number): Promise<PhraseRule> {
    const rows = await this.db.execute(sql`
      INSERT INTO phrase_rules (type, value, cooldown_sec) VALUES (${type}, ${value}, ${cooldownSec ?? null})
      RETURNING id::text, type, value, cooldown_sec, is_enabled
    `);
    const raw = ((Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0]!;
    this.invalidatePhraseRules();
    return { id: String(raw.id), type: String(raw.type) as PhraseRule['type'], value: String(raw.value), cooldownSec: raw.cooldown_sec ? Number(raw.cooldown_sec) : undefined, isEnabled: true };
  }

  async updatePhraseRule(id: string, updates: { value?: string; isEnabled?: boolean; cooldownSec?: number }): Promise<void> {
    if (updates.value !== undefined) await this.db.execute(sql`UPDATE phrase_rules SET value = ${updates.value} WHERE id = ${id}::uuid`);
    if (updates.isEnabled !== undefined) await this.db.execute(sql`UPDATE phrase_rules SET is_enabled = ${updates.isEnabled} WHERE id = ${id}::uuid`);
    if (updates.cooldownSec !== undefined) await this.db.execute(sql`UPDATE phrase_rules SET cooldown_sec = ${updates.cooldownSec} WHERE id = ${id}::uuid`);
    this.invalidatePhraseRules();
  }

  async deletePhraseRule(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM phrase_rules WHERE id = ${id}::uuid`);
    this.invalidatePhraseRules();
  }

  // ─── Bot user ────────────────────────────────────────

  private async getBotUserId(): Promise<string> {
    if (this.botUserId) return this.botUserId;
    const rows = await this.db.execute(sql`SELECT id::text FROM users WHERE address = 'system_oracle'`);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    if (rawRows.length > 0) {
      this.botUserId = String(rawRows[0]!.id);
      return this.botUserId;
    }
    const insertRows = await this.db.execute(sql`
      INSERT INTO users (address, profile_nickname) VALUES ('system_oracle', 'Oracle')
      ON CONFLICT (address) DO NOTHING
      RETURNING id::text
    `);
    const rawInsert = (Array.isArray(insertRows) ? insertRows : (insertRows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    this.botUserId = String(rawInsert[0]!.id);
    return this.botUserId;
  }

  // ─── Persona resolution ─────────────────────────────

  private isPersonaScheduleActive(p: Persona): boolean {
    if (!p.schedule) return true;
    const tz = p.schedule.timezone ?? 'UTC';
    let now: Date;
    try {
      now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    } catch {
      now = new Date();
    }
    if (p.schedule.days && p.schedule.days.length > 0) {
      if (!p.schedule.days.includes(now.getDay())) return false;
    }
    const hour = now.getHours();
    if (p.schedule.startHour !== undefined && p.schedule.endHour !== undefined) {
      if (p.schedule.startHour <= p.schedule.endHour) {
        if (hour < p.schedule.startHour || hour >= p.schedule.endHour) return false;
      } else {
        // Overnight range e.g. 22-6
        if (hour < p.schedule.startHour && hour >= p.schedule.endHour) return false;
      }
    }
    return true;
  }

  private resolvePersona(config: BotConfig, eventType: EventType): Persona | null {
    const isAvailable = (p: Persona) => p.enabled !== false && this.isPersonaScheduleActive(p);
    const availablePersonas = config.personas.filter(isAvailable);
    if (availablePersonas.length === 0) return null;

    // If trigger has a specific persona mapped, use it
    const trigger = config.triggerMappings.find(t => t.eventType === eventType && t.enabled);
    if (trigger?.personaId) {
      const persona = availablePersonas.find(p => p.id === trigger.personaId);
      if (persona) return persona;
    }

    // Otherwise pick a random persona from all enabled ones
    return availablePersonas[Math.floor(Math.random() * availablePersonas.length)] ?? null;
  }

  private shouldTrigger(config: BotConfig, eventType: EventType): boolean {
    const trigger = config.triggerMappings.find(t => t.eventType === eventType);
    if (!trigger || !trigger.enabled) return true;

    const cooldown = trigger.cooldownSec ?? 0;
    if (cooldown > 0) {
      const lastTime = this.lastTriggerTimes.get(eventType) ?? 0;
      if (Date.now() - lastTime < cooldown * 1000) return false;
    }

    const prob = trigger.probability ?? 100;
    if (prob < 100 && Math.random() * 100 > prob) return false;

    return true;
  }

  private recordTrigger(eventType: EventType) {
    this.lastTriggerTimes.set(eventType, Date.now());
  }

  // ─── Safety mode checks ────────────────────────────

  private isChatAllowed(config: BotConfig): boolean {
    if (config.safetyMode === 'event_only') return false;
    if (config.safetyMode === 'chat_read_only') return false;
    return config.chatBotEnabled;
  }

  // ─── Prompt builder ─────────────────────────────────

  private buildSystemPrompt(config: BotConfig, persona?: Persona | null): string {
    let prompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Style level hints
    const levels: string[] = [];
    if (config.emojiIntensity !== 1) levels.push(`Emoji intensity: ${config.emojiIntensity}/3`);
    if (config.humorLevel !== 3) levels.push(`Humor level: ${config.humorLevel}/5`);
    if (config.dramaLevel !== 3) levels.push(`Drama level: ${config.dramaLevel}/5`);
    if (config.sarcasmLevel !== 2) levels.push(`Sarcasm level: ${config.sarcasmLevel}/5`);
    if (config.premiumLevel !== 3) levels.push(`Premium tone: ${config.premiumLevel}/5`);
    if (levels.length > 0) {
      prompt += `\n\nStyle levels (adjust accordingly):\n${levels.join('\n')}`;
    }

    if (persona) {
      prompt += `\n\nActive persona: "${persona.name}"\n${persona.prompt}`;
    }

    if (config.extraContext) {
      prompt += `\n\nAdditional context from admin:\n${config.extraContext}`;
    }

    // Preferred phrases
    const preferred = this.getPreferredPhrases();
    if (preferred.length > 0) {
      prompt += `\n\nBranded phrases you may occasionally use (don't overuse):\n${preferred.map(p => `- "${p}"`).join('\n')}`;
    }

    // Anti-repeat injection
    const recent = this.recentPhrases.getRecent(5);
    if (recent.length > 0) {
      prompt += `\n\nAVOID these recent phrases (do NOT repeat or closely paraphrase):\n${recent.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`;
    }

    return prompt;
  }

  private buildEventPrompt(payload: EventPayload): string {
    const parts: string[] = [];

    // Inject player memory if available
    if (payload.player) {
      const ctx = this.playerMemory.get(payload.player);
      if (ctx) {
        const lines: string[] = [];
        if (ctx.lastStreak >= 2) lines.push(`${payload.player} is on a ${ctx.lastStreak}-win streak`);
        if (ctx.totalBets >= 5) lines.push(`${payload.player} has played ${ctx.totalBets} bets recently`);
        if (ctx.lastResult === 'loss') lines.push(`${payload.player} lost their last bet`);
        if (lines.length > 0) parts.push(`Player context: ${lines.join('. ')}.`);
      }
    }

    switch (payload.event) {
      case 'bet_comment':
      case 'win_comment':
        parts.push(`Bet result: ${payload.player} ${payload.result === 'win' ? 'WON' : 'played'} against ${payload.opponent ?? 'opponent'}.`);
        if (payload.amount) parts.push(`Stake: ${payload.amount} AXM each.`);
        if (payload.side) parts.push(`Side: ${payload.side}.`);
        if (payload.winAmount) parts.push(`Payout: ${payload.winAmount} AXM.`);
        if (payload.streak && payload.streak >= 2) parts.push(`${payload.player} is on a ${payload.streak}-win streak!`);
        parts.push('Generate a short, exciting commentary about this moment.');
        break;

      case 'loss_comment':
        parts.push(`${payload.player} just LOST to ${payload.opponent ?? 'opponent'}.`);
        if (payload.amount) parts.push(`Lost: ${payload.amount} AXM.`);
        parts.push('Comment on this loss with drama and light humor. No humiliation.');
        break;

      case 'big_bet':
        parts.push(`BIG BET! ${payload.player} is wagering ${payload.amount} AXM on ${payload.side ?? 'the flip'}!`);
        parts.push('This should feel like a major arena event. Build tension and hype!');
        break;

      case 'huge_bet':
        parts.push(`HUGE HIGH-STAKES BET! ${payload.player} just put down ${payload.amount} AXM!`);
        parts.push('This is a prestige moment. Maximum drama, luxury, danger vibes.');
        break;

      case 'streak_comment':
        parts.push(`${payload.player} is on a ${payload.streak}-win STREAK!`);
        parts.push('This player is on fire. Comment on the momentum, the legend building.');
        break;

      case 'upset_comment':
        parts.push(`UPSET! ${payload.player} just beat ${payload.opponent}!`);
        if (payload.amount) parts.push(`Amount: ${payload.amount} AXM.`);
        parts.push('This was unexpected. React with explosive surprise!');
        break;

      case 'chat_reply':
        parts.push(`User "${payload.player}" said in chat: "${payload.chatMessage}"`);
        parts.push('Reply naturally, wittily, in-character. Keep it short.');
        break;

      case 'fairness_reply':
        parts.push('Someone asked about game fairness or how CoinFlip works.');
        parts.push('Briefly confirm: provably fair, commit-reveal, no one can cheat. Make it sound cool, not boring.');
        break;

      case 'silence':
        parts.push('The chat has been quiet for a while.');
        parts.push('Post a conversation starter. Tease about the game, challenge someone to play, or drop a cool one-liner. Be natural — don\'t literally say "the chat is quiet".');
        break;

      case 'jackpot':
        parts.push(`JACKPOT! ${payload.player} just won ${payload.winAmount ?? payload.amount} AXM from the jackpot!`);
        parts.push('Celebrate this epic moment! Go big!');
        break;

      case 'system_announcement':
        parts.push(payload.chatMessage ?? 'System event occurred.');
        parts.push('Announce this like the official voice of the arena.');
        break;
    }

    parts.push('\nResponse format: {"ru":"...","en":"..."}');
    return parts.join('\n');
  }

  // ─── GPT call with validation ─────────────────────

  private async callGPT(systemPrompt: string, userPrompt: string, model?: string, temperature?: number): Promise<{ ru: string; en: string } | null> {
    if (!env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not set — skipping AI generation');
      return null;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: model ?? 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 250,
          temperature: temperature ?? 0.95,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'OpenAI API error');
        return null;
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      return this.validateAndParseResponse(content);
    } catch (err) {
      logger.error({ err }, 'Failed to call OpenAI API');
      return null;
    }
  }

  private validateAndParseResponse(content: string): { ru: string; en: string } | null {
    let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ content }, 'AI response not in expected JSON format');
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.ru !== 'string' || typeof parsed.en !== 'string') {
        logger.warn({ parsed }, 'AI response missing ru/en fields');
        return null;
      }

      const ru = parsed.ru.trim().slice(0, 300);
      const en = parsed.en.trim().slice(0, 300);
      if (!ru || !en) return null;

      if (this.hasSafetyViolation(ru) || this.hasSafetyViolation(en)) {
        logger.warn({ ru, en }, 'AI response failed safety check');
        return null;
      }

      // Phrase rules check
      const ruCheck = this.checkPhraseRules(ru);
      if (!ruCheck.passed) {
        logger.info({ reason: ruCheck.reason }, 'AI response failed phrase rule (ru)');
        return null;
      }
      const enCheck = this.checkPhraseRules(en);
      if (!enCheck.passed) {
        logger.info({ reason: enCheck.reason }, 'AI response failed phrase rule (en)');
        return null;
      }

      return { ru, en };
    } catch {
      logger.warn({ content }, 'Failed to parse AI response JSON');
      return null;
    }
  }

  private hasSafetyViolation(text: string): boolean {
    const lower = text.toLowerCase();
    const patterns = [
      /guaranteed?\s+(win|profit|money)/i,
      /financial\s+advice/i,
      /you\s+will\s+(definitely|certainly)\s+win/i,
      /invest\s+(now|today)/i,
    ];
    if (patterns.some(p => p.test(lower))) return true;

    // Check config-level banned phrases
    if (this.config) {
      for (const phrase of this.config.bannedPhrases) {
        if (phrase && lower.includes(phrase.toLowerCase())) return true;
      }
      for (const pattern of this.config.softBannedPatterns) {
        try {
          if (pattern && new RegExp(pattern, 'i').test(text)) return true;
        } catch { /* invalid regex, skip */ }
      }
    }

    return false;
  }

  // ─── Commentary (ticker) ─────────────────────────────

  async onBetResolved(context: BetContext): Promise<void> {
    const config = await this.getConfig();
    if (!config.commentaryEnabled) return;
    await this.loadPhraseRules();

    const existing = await this.db.execute(sql`SELECT 1 FROM ai_commentary WHERE bet_id = ${context.betId} LIMIT 1`);
    const existingRows = (Array.isArray(existing) ? existing : (existing as { rows?: unknown[] }).rows ?? []) as unknown[];
    if (existingRows.length > 0) return;

    const amount = Number(context.amount);
    let eventType: EventType;
    if (amount >= (config.bigBetThreshold * 4)) {
      eventType = 'huge_bet';
    } else if (amount >= config.bigBetThreshold) {
      eventType = 'big_bet';
    } else {
      eventType = Math.random() < 0.5 ? 'win_comment' : 'loss_comment';
    }

    if (!this.shouldTrigger(config, eventType)) return;

    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona);

    const isLossFocus = eventType === 'loss_comment';
    const payload: EventPayload = {
      event: eventType,
      player: isLossFocus ? context.loserNickname : context.winnerNickname,
      opponent: isLossFocus ? context.winnerNickname : context.loserNickname,
      side: context.winnerSide,
      amount,
      token: 'AXM',
      result: isLossFocus ? 'loss' : 'win',
      winAmount: isLossFocus ? undefined : context.payoutAmount,
      lossAmount: isLossFocus ? context.amount : undefined,
    };

    const userPrompt = this.buildEventPrompt(payload);
    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.recordTrigger(eventType);
    this.recordPhraseUsage(result.ru);
    this.recordPhraseUsage(result.en);

    // Update player memory
    this.playerMemory.update(context.winnerNickname, 'win', amount, 0);
    this.playerMemory.update(context.loserNickname, 'loss', amount, 0);

    try {
      await this.db.execute(sql`
        INSERT INTO ai_commentary (bet_id, text_ru, text_en, event_type, persona_id)
        VALUES (${context.betId}, ${result.ru}, ${result.en}, ${eventType}, ${persona?.id ?? null})
      `);

      await this.logMessage(eventType, persona?.id ?? null, result, payload, meta);

      wsService.broadcast({
        type: 'ai_commentary',
        data: { betId: context.betId, textRu: result.ru, textEn: result.en, createdAt: new Date().toISOString() },
      });

      logger.info({ betId: context.betId, persona: persona?.id, event: eventType }, 'AI commentary generated');
    } catch (err) {
      logger.error({ err, betId: context.betId }, 'Failed to save AI commentary');
    }
  }

  private async callGPTWithAntiRepeat(
    systemPrompt: string,
    userPrompt: string,
    model?: string,
    temperature?: number,
    maxAttempts = 2,
  ): Promise<{ result: { ru: string; en: string } | null; meta: GenerationMeta }> {
    const meta: GenerationMeta = { wasRegenerated: false, similarityScore: null, inputContext: null };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.callGPT(systemPrompt, userPrompt, model, temperature);
      if (!result) return { result: null, meta };

      const checkRu = this.recentPhrases.isTooSimilar(result.ru);
      const checkEn = this.recentPhrases.isTooSimilar(result.en);
      meta.similarityScore = Math.max(checkRu.score, checkEn.score);

      if (!checkRu.similar && !checkEn.similar) {
        this.recentPhrases.add(result.ru);
        this.recentPhrases.add(result.en);
        return { result, meta };
      }

      meta.wasRegenerated = true;
      logger.info({ attempt, ru: result.ru.slice(0, 60) }, 'Anti-repeat: regenerating');
    }

    const result = await this.callGPT(systemPrompt, userPrompt, model, temperature);
    if (result) {
      this.recentPhrases.add(result.ru);
      this.recentPhrases.add(result.en);
    }
    return { result, meta };
  }

  private async logMessage(
    eventType: string, personaId: string | null,
    result: { ru: string; en: string },
    payload: EventPayload | null,
    meta: GenerationMeta,
  ) {
    try {
      await this.db.execute(sql`
        INSERT INTO ai_bot_message_log (event_type, persona_id, output_ru, output_en, input_context, was_regenerated, was_delivered, similarity_score)
        VALUES (${eventType}, ${personaId}, ${result.ru}, ${result.en}, ${payload ? JSON.stringify(payload) : null}::jsonb, ${meta.wasRegenerated}, true, ${meta.similarityScore})
      `);
    } catch (err) {
      logger.error({ err }, 'Failed to log bot message');
    }
  }

  async getRecentCommentary(limit = 10): Promise<Array<{
    betId: string; textRu: string; textEn: string; createdAt: string;
    eventType?: string; personaId?: string;
  }>> {
    const rows = await this.db.execute(sql`
      SELECT bet_id, text_ru, text_en, created_at,
             COALESCE(event_type, 'bet_comment') as event_type, persona_id
      FROM ai_commentary ORDER BY created_at DESC LIMIT ${limit}
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    return rawRows.map(r => ({
      betId: String(r.bet_id), textRu: String(r.text_ru), textEn: String(r.text_en),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      eventType: r.event_type ? String(r.event_type) : undefined,
      personaId: r.persona_id ? String(r.persona_id) : undefined,
    }));
  }

  // ─── Chat Bot ────────────────────────────────────────

  async onChatMessage(message: string, senderNickname: string, senderAddress: string): Promise<void> {
    const config = await this.getConfig();
    if (!this.isChatAllowed(config)) return;
    if (senderAddress === 'system_oracle') return;

    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    const botNameLower = config.botName.toLowerCase();
    const mentionPatterns = [`@${botNameLower}`, '@оракул', '@oracle', '@бот', '@bot'];
    // Also match @displayName for all enabled personas
    for (const p of config.personas) {
      if (p.enabled !== false && p.displayName) {
        mentionPatterns.push(`@${p.displayName.toLowerCase()}`);
      }
    }
    const msgLower = message.toLowerCase();
    const isMention = config.respondToMentions && mentionPatterns.some(p => msgLower.includes(p));
    if (!isMention) return;

    const eventType: EventType = 'chat_reply';
    if (!this.shouldTrigger(config, eventType)) return;
    await this.loadPhraseRules();

    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona) + '\n\nTASK: You are replying in the global chat. Keep it short and witty.';

    const payload: EventPayload = { event: 'chat_reply', player: senderNickname, chatMessage: message };
    const userPrompt = this.buildEventPrompt(payload);

    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.lastChatMessageAt = Date.now();
    this.recordTrigger(eventType);
    this.recordPhraseUsage(result.ru);
    this.recordPhraseUsage(result.en);
    await this.postBotChatMessage(result, config, 'chat_reply', persona?.id ?? null, payload, meta);
  }

  async onBigBetCreated(nickname: string, amount: string): Promise<void> {
    const config = await this.getConfig();
    if (!this.isChatAllowed(config) || !config.reactToBigBets) return;

    const amountNum = Number(amount);
    if (amountNum < config.bigBetThreshold) return;

    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    const eventType: EventType = amountNum >= config.bigBetThreshold * 4 ? 'huge_bet' : 'big_bet';
    if (!this.shouldTrigger(config, eventType)) return;
    await this.loadPhraseRules();

    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona) + '\n\nTASK: React to a big bet in chat. Build hype!';

    const payload: EventPayload = { event: eventType, player: nickname, amount: amountNum, token: 'AXM' };
    const userPrompt = this.buildEventPrompt(payload);

    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.lastChatMessageAt = Date.now();
    this.recordTrigger(eventType);
    this.recordPhraseUsage(result.ru);
    this.recordPhraseUsage(result.en);
    await this.postBotChatMessage(result, config, eventType, persona?.id ?? null, payload, meta);
  }

  async onWinStreak(nickname: string, streakCount: number): Promise<void> {
    const config = await this.getConfig();
    if (!this.isChatAllowed(config) || !config.reactToStreaks) return;
    if (streakCount < config.streakThreshold) return;

    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    const eventType: EventType = 'streak_comment';
    if (!this.shouldTrigger(config, eventType)) return;
    await this.loadPhraseRules();

    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona) + '\n\nTASK: Comment on an impressive win streak in chat.';

    const payload: EventPayload = { event: 'streak_comment', player: nickname, streak: streakCount };
    const userPrompt = this.buildEventPrompt(payload);

    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.lastChatMessageAt = Date.now();
    this.recordTrigger(eventType);
    this.playerMemory.update(nickname, 'win', 0, streakCount);
    await this.postBotChatMessage(result, config, eventType, persona?.id ?? null, payload, meta);
  }

  async onJackpotWon(nickname: string, amount: string): Promise<void> {
    const config = await this.getConfig();
    if (!this.isChatAllowed(config)) return;
    await this.loadPhraseRules();

    const eventType: EventType = 'jackpot';
    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona) + '\n\nTASK: Celebrate a JACKPOT WIN in chat! Maximum hype!';

    const payload: EventPayload = { event: 'jackpot', player: nickname, winAmount: amount, token: 'AXM' };
    const userPrompt = this.buildEventPrompt(payload);

    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.lastChatMessageAt = Date.now();
    this.recordTrigger(eventType);
    await this.postBotChatMessage(result, config, eventType, persona?.id ?? null, payload, meta);
  }

  // ─── Chat message poster ─────────────────────────────

  private async postBotChatMessage(
    result: { ru: string; en: string },
    config: BotConfig,
    eventType: string,
    personaId: string | null,
    payload: EventPayload | null = null,
    meta: GenerationMeta = { wasRegenerated: false, similarityScore: null, inputContext: null },
  ): Promise<void> {
    try {
      const botUserId = await this.getBotUserId();
      const persona = personaId ? config.personas.find(p => p.id === personaId) : null;
      const displayName = persona?.displayName || config.botName;

      const rows = await this.db.execute(sql`
        INSERT INTO global_chat_messages (user_id, message, style, effect, persona_id)
        VALUES (${botUserId}, ${result.ru + '\n---\n' + result.en}, 'ai_bot', null, ${personaId})
        RETURNING id::text, created_at
      `);
      const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
      const row = rawRows[0]!;

      await this.logMessage(eventType, personaId, result, payload, meta);

      wsService.emitChatMessage({
        id: String(row.id), userId: botUserId, address: 'system_oracle',
        nickname: displayName, vipTier: 'ai',
        message: result.ru + '\n---\n' + result.en, style: 'ai_bot', effect: null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        textRu: result.ru, textEn: result.en,
        avatarUrl: persona?.avatarUrl ?? undefined,
        nameColor: persona?.nameColor ?? undefined,
      });

      logger.info({ trigger: eventType, persona: personaId, displayName }, 'AI bot posted chat message');
    } catch (err) {
      logger.error({ err, trigger: eventType }, 'Failed to post AI bot message');
    }
  }

  // ─── Silence watcher ─────────────────────────────────

  private async postSilenceMessage(): Promise<void> {
    const config = await this.getConfig();
    if (!this.isChatAllowed(config) || !config.postOnSilence) return;

    const rows = await this.db.execute(sql`SELECT created_at FROM global_chat_messages ORDER BY created_at DESC LIMIT 1`);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length > 0) {
      const lastMsgTime = new Date(String(rawRows[0]!.created_at)).getTime();
      if (Date.now() - lastMsgTime < config.silenceMinutes * 60 * 1000) return;
    }

    await this.loadPhraseRules();
    const eventType: EventType = 'silence';
    const persona = this.resolvePersona(config, eventType);
    const systemPrompt = this.buildSystemPrompt(config, persona) + '\n\nTASK: Chat has been quiet. Post a natural conversation starter.';

    const payload: EventPayload = { event: 'silence' };
    const userPrompt = this.buildEventPrompt(payload);

    const { result, meta } = await this.callGPTWithAntiRepeat(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return;

    this.lastChatMessageAt = Date.now();
    this.recordTrigger(eventType);
    await this.postBotChatMessage(result, config, eventType, persona?.id ?? null, payload, meta);
  }

  startSilenceWatcher() {
    if (this.silenceTimer) return;
    this.silenceTimer = setInterval(() => {
      this.postSilenceMessage().catch(err => logger.error({ err }, 'Silence watcher error'));
    }, 30 * 60 * 1000);
    logger.info('AI bot silence watcher started');
  }

  stopSilenceWatcher() {
    if (this.silenceTimer) { clearInterval(this.silenceTimer); this.silenceTimer = null; }
  }

  // ─── Win streak helper ───────────────────────────────

  async getWinStreak(userId: string): Promise<number> {
    const rows = await this.db.execute(sql`
      SELECT status, winner_user_id FROM bets
      WHERE (maker_user_id = ${userId} OR acceptor_user_id = ${userId}) AND status = 'revealed'
      ORDER BY resolved_time DESC LIMIT 20
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    let streak = 0;
    for (const row of rawRows) {
      if (String(row.winner_user_id) === userId) { streak++; } else { break; }
    }
    return streak;
  }

  // ─── Preview / Test ──────────────────────────────────

  async generatePreview(eventType: EventType, payload: Partial<EventPayload>, personaOverride?: string): Promise<{
    ru: string; en: string; personaUsed: string | null; systemPrompt: string; userPrompt: string;
  } | null> {
    const config = await this.getConfig();
    await this.loadPhraseRules();

    let persona: Persona | null = null;
    if (personaOverride) {
      persona = config.personas.find(p => p.id === personaOverride) ?? null;
    } else {
      persona = this.resolvePersona(config, eventType);
    }

    const systemPrompt = this.buildSystemPrompt(config, persona);
    const fullPayload: EventPayload = {
      event: eventType, player: payload.player ?? 'TestPlayer', opponent: payload.opponent ?? 'Opponent',
      side: payload.side ?? 'heads', amount: payload.amount ?? 100, token: 'AXM',
      streak: payload.streak, result: payload.result ?? 'win', chatMessage: payload.chatMessage,
      ...payload,
    };
    const userPrompt = this.buildEventPrompt(fullPayload);

    const result = await this.callGPT(systemPrompt, userPrompt, config.model, config.temperature);
    if (!result) return null;

    return { ...result, personaUsed: persona?.id ?? null, systemPrompt, userPrompt };
  }

  // ─── Admin API helpers ───────────────────────────────

  async updateConfig(updates: Partial<BotConfig>): Promise<void> {
    const fieldMap: Record<string, string> = {
      commentaryEnabled: 'commentary_enabled', chatBotEnabled: 'chat_bot_enabled',
      botName: 'bot_name', systemPrompt: 'system_prompt', model: 'model',
      chatCooldownSec: 'chat_cooldown_sec', bigBetThreshold: 'big_bet_threshold',
      streakThreshold: 'streak_threshold', silenceMinutes: 'silence_minutes',
      respondToMentions: 'respond_to_mentions', reactToBigBets: 'react_to_big_bets',
      reactToStreaks: 'react_to_streaks', postOnSilence: 'post_on_silence',
      extraContext: 'extra_context', activePersonaId: 'active_persona_id',
      antiRepeatCount: 'anti_repeat_count', safetyStrict: 'safety_strict',
      temperature: 'temperature', emojiIntensity: 'emoji_intensity',
      humorLevel: 'humor_level', dramaLevel: 'drama_level',
      sarcasmLevel: 'sarcasm_level', premiumLevel: 'premium_level',
      fairnessMentions: 'fairness_mentions', profanityFilter: 'profanity_filter',
      safetyMode: 'safety_mode',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (updates as Record<string, unknown>)[key];
      if (val !== undefined) {
        await this.db.execute(sql`UPDATE ai_bot_config SET ${sql.raw(col)} = ${val as any}`);
      }
    }

    // JSONB fields
    if (updates.personas !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET personas = ${JSON.stringify(updates.personas)}::jsonb`);
    }
    if (updates.triggerMappings !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET trigger_mappings = ${JSON.stringify(updates.triggerMappings)}::jsonb`);
    }
    if (updates.bannedPhrases !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET banned_phrases = ${JSON.stringify(updates.bannedPhrases)}::jsonb`);
    }
    if (updates.softBannedPatterns !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET soft_banned_patterns = ${JSON.stringify(updates.softBannedPatterns)}::jsonb`);
    }

    await this.db.execute(sql`UPDATE ai_bot_config SET updated_at = NOW()`);
    this.invalidateConfig();
  }

  async clearCommentary(): Promise<number> {
    const result = await this.db.execute(sql`WITH deleted AS (DELETE FROM ai_commentary RETURNING 1) SELECT count(*)::int AS cnt FROM deleted`);
    return Number(((Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0]?.cnt ?? 0);
  }

  async clearBotChatMessages(): Promise<number> {
    const botUserId = await this.getBotUserId();
    const result = await this.db.execute(sql`WITH deleted AS (DELETE FROM global_chat_messages WHERE user_id = ${botUserId}::uuid RETURNING 1) SELECT count(*)::int AS cnt FROM deleted`);
    return Number(((Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>)[0]?.cnt ?? 0);
  }

  async getRecentBotChatMessages(limit: number): Promise<Array<{ id: string; message: string; createdAt: string }>> {
    const botUserId = await this.getBotUserId();
    const rows = await this.db.execute(sql`SELECT id::text, message, created_at FROM global_chat_messages WHERE user_id = ${botUserId}::uuid ORDER BY created_at DESC LIMIT ${limit}`);
    return ((Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), message: String(r.message), createdAt: String(r.created_at),
    }));
  }

  async getStats(): Promise<{
    totalCommentary: number; totalChatMessages: number;
    lastCommentaryAt: string | null; lastChatMessageAt: string | null;
    commentaryByEvent: Record<string, number>; commentaryByPersona: Record<string, number>;
    avgLength: number; regenRate: number; personaUsage: Record<string, number>;
  }> {
    const botUserId = await this.getBotUserId();
    const [commResult, chatResult, byEventResult, byPersonaResult, logStatsResult, personaUsageResult] = await Promise.all([
      this.db.execute(sql`SELECT count(*)::int AS cnt, max(created_at)::text AS last_at FROM ai_commentary`),
      this.db.execute(sql`SELECT count(*)::int AS cnt, max(created_at)::text AS last_at FROM global_chat_messages WHERE user_id = ${botUserId}::uuid`),
      this.db.execute(sql`SELECT COALESCE(event_type, 'bet_comment') as event_type, count(*)::int AS cnt FROM ai_commentary GROUP BY event_type`).catch(() => []),
      this.db.execute(sql`SELECT COALESCE(persona_id, 'none') as persona_id, count(*)::int AS cnt FROM ai_commentary WHERE persona_id IS NOT NULL GROUP BY persona_id`).catch(() => []),
      this.db.execute(sql`SELECT avg(length(output_ru) + length(output_en))::int AS avg_len, (count(*) FILTER (WHERE was_regenerated = true) * 100.0 / GREATEST(count(*), 1))::int AS regen_pct FROM ai_bot_message_log`).catch(() => []),
      this.db.execute(sql`SELECT COALESCE(persona_id, 'none') as persona_id, count(*)::int AS cnt FROM ai_bot_message_log WHERE persona_id IS NOT NULL GROUP BY persona_id`).catch(() => []),
    ]);

    const toRows = (r: unknown) => (Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    const commentaryByEvent: Record<string, number> = {};
    for (const r of toRows(byEventResult)) commentaryByEvent[String(r.event_type)] = Number(r.cnt);

    const commentaryByPersona: Record<string, number> = {};
    for (const r of toRows(byPersonaResult)) commentaryByPersona[String(r.persona_id)] = Number(r.cnt);

    const personaUsage: Record<string, number> = {};
    for (const r of toRows(personaUsageResult)) personaUsage[String(r.persona_id)] = Number(r.cnt);

    const commRows = toRows(commResult);
    const chatRows = toRows(chatResult);
    const logStats = toRows(logStatsResult);

    return {
      totalCommentary: Number(commRows[0]?.cnt ?? 0),
      totalChatMessages: Number(chatRows[0]?.cnt ?? 0),
      lastCommentaryAt: commRows[0]?.last_at ? String(commRows[0].last_at) : null,
      lastChatMessageAt: chatRows[0]?.last_at ? String(chatRows[0].last_at) : null,
      commentaryByEvent, commentaryByPersona,
      avgLength: Number(logStats[0]?.avg_len ?? 0),
      regenRate: Number(logStats[0]?.regen_pct ?? 0),
      personaUsage,
    };
  }

  async getMessageLog(limit = 30): Promise<Array<{
    id: string; eventType: string; personaId: string | null;
    outputRu: string; outputEn: string; createdAt: string;
    inputContext: unknown; wasRegenerated: boolean; wasDelivered: boolean; similarityScore: number | null;
  }>> {
    const rows = await this.db.execute(sql`
      SELECT id::text, event_type, persona_id, output_ru, output_en, created_at,
             input_context, was_regenerated, was_delivered, similarity_score
      FROM ai_bot_message_log ORDER BY created_at DESC LIMIT ${limit}
    `);
    return ((Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), eventType: String(r.event_type ?? 'unknown'),
      personaId: r.persona_id ? String(r.persona_id) : null,
      outputRu: String(r.output_ru ?? ''), outputEn: String(r.output_en ?? ''),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      inputContext: r.input_context ?? null, wasRegenerated: r.was_regenerated === true,
      wasDelivered: r.was_delivered !== false, similarityScore: r.similarity_score != null ? Number(r.similarity_score) : null,
    }));
  }

  getDefaultPersonas(): Persona[] { return DEFAULT_PERSONAS; }
  getDefaultSystemPrompt(): string { return DEFAULT_SYSTEM_PROMPT; }
  getDefaultTriggerMappings(): TriggerMapping[] { return DEFAULT_TRIGGER_MAPPINGS; }
}

export const aiBotService = new AiBotService();
