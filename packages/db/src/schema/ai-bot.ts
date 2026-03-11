import { pgTable, uuid, text, timestamp, boolean, integer, index, jsonb } from 'drizzle-orm/pg-core';

/** AI bot configuration — single row, updated via admin panel */
export const aiBotConfig = pgTable('ai_bot_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Whether commentary generation is enabled */
  commentaryEnabled: boolean('commentary_enabled').notNull().default(true),
  /** Whether chat bot responses are enabled */
  chatBotEnabled: boolean('chat_bot_enabled').notNull().default(true),
  /** Bot display name */
  botName: text('bot_name').notNull().default('Oracle'),
  /** Bot personality / system prompt (defines tone, style, behavior) */
  systemPrompt: text('system_prompt').notNull().default(''),
  /** Persona presets: JSON array of { id, name, prompt } — admin can switch between them */
  personas: jsonb('personas').notNull().default('[]'),
  /** Active persona ID (matches one from personas array) */
  activePersonaId: text('active_persona_id'),
  /** GPT model to use */
  model: text('model').notNull().default('gpt-4o-mini'),
  /** Min seconds between bot chat messages (global cooldown) */
  chatCooldownSec: integer('chat_cooldown_sec').notNull().default(30),
  /** Min bet amount (in display units, e.g. 500) to trigger "big bet" commentary */
  bigBetThreshold: integer('big_bet_threshold').notNull().default(500),
  /** Win streak count to trigger streak commentary */
  streakThreshold: integer('streak_threshold').notNull().default(3),
  /** Minutes of chat silence before bot posts a conversation starter */
  silenceMinutes: integer('silence_minutes').notNull().default(15),
  /** Whether bot responds to @mention in chat */
  respondToMentions: boolean('respond_to_mentions').notNull().default(true),
  /** Whether bot reacts to big bets in chat */
  reactToBigBets: boolean('react_to_big_bets').notNull().default(true),
  /** Whether bot reacts to win streaks */
  reactToStreaks: boolean('react_to_streaks').notNull().default(true),
  /** Whether bot posts conversation starters on silence */
  postOnSilence: boolean('post_on_silence').notNull().default(true),
  /** Additional context/instructions that admin can edit freely */
  extraContext: text('extra_context').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** AI-generated commentary for resolved bets — displayed in the ticker */
export const aiCommentary = pgTable(
  'ai_commentary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Reference to the resolved bet */
    betId: text('bet_id').notNull(),
    /** Commentary text in Russian */
    textRu: text('text_ru').notNull(),
    /** Commentary text in English */
    textEn: text('text_en').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_commentary_created').on(t.createdAt),
  ],
);
