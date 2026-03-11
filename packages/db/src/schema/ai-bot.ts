import { pgTable, uuid, text, timestamp, boolean, integer, index, jsonb, real } from 'drizzle-orm/pg-core';

/** AI bot configuration — single row, updated via admin panel */
export const aiBotConfig = pgTable('ai_bot_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentaryEnabled: boolean('commentary_enabled').notNull().default(true),
  chatBotEnabled: boolean('chat_bot_enabled').notNull().default(true),
  botName: text('bot_name').notNull().default('Oracle'),
  systemPrompt: text('system_prompt').notNull().default(''),
  personas: jsonb('personas').notNull().default('[]'),
  activePersonaId: text('active_persona_id'),
  model: text('model').notNull().default('gpt-4o-mini'),
  chatCooldownSec: integer('chat_cooldown_sec').notNull().default(30),
  bigBetThreshold: integer('big_bet_threshold').notNull().default(500),
  streakThreshold: integer('streak_threshold').notNull().default(3),
  silenceMinutes: integer('silence_minutes').notNull().default(120),
  respondToMentions: boolean('respond_to_mentions').notNull().default(true),
  reactToBigBets: boolean('react_to_big_bets').notNull().default(true),
  reactToStreaks: boolean('react_to_streaks').notNull().default(true),
  postOnSilence: boolean('post_on_silence').notNull().default(true),
  extraContext: text('extra_context').notNull().default(''),
  triggerMappings: jsonb('trigger_mappings').notNull().default('[]'),
  antiRepeatCount: integer('anti_repeat_count').notNull().default(30),
  safetyStrict: boolean('safety_strict').notNull().default(false),
  /** Style controls */
  temperature: real('temperature').notNull().default(0.95),
  emojiIntensity: integer('emoji_intensity').notNull().default(1),
  humorLevel: integer('humor_level').notNull().default(3),
  dramaLevel: integer('drama_level').notNull().default(3),
  sarcasmLevel: integer('sarcasm_level').notNull().default(2),
  premiumLevel: integer('premium_level').notNull().default(3),
  fairnessMentions: boolean('fairness_mentions').notNull().default(true),
  profanityFilter: boolean('profanity_filter').notNull().default(true),
  /** Safety mode: strict | playful | safe_chat | event_only | chat_read_only */
  safetyMode: text('safety_mode').notNull().default('safe_chat'),
  bannedPhrases: jsonb('banned_phrases').notNull().default('[]'),
  softBannedPatterns: jsonb('soft_banned_patterns').notNull().default('[]'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** AI-generated commentary for resolved bets — displayed in the ticker */
export const aiCommentary = pgTable(
  'ai_commentary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    betId: text('bet_id').notNull(),
    textRu: text('text_ru').notNull(),
    textEn: text('text_en').notNull(),
    eventType: text('event_type'),
    personaId: text('persona_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_commentary_created').on(t.createdAt),
  ],
);

/** Log of all AI bot chat messages — for analytics and debugging */
export const aiBotMessageLog = pgTable(
  'ai_bot_message_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull().default('unknown'),
    personaId: text('persona_id'),
    outputRu: text('output_ru').notNull().default(''),
    outputEn: text('output_en').notNull().default(''),
    inputContext: jsonb('input_context'),
    wasRegenerated: boolean('was_regenerated').notNull().default(false),
    wasDelivered: boolean('was_delivered').notNull().default(true),
    similarityScore: real('similarity_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_bot_message_log_created').on(t.createdAt),
  ],
);

/** Phrase rules for quality control — blacklist, cooldown, preferred, forbidden openings */
export const phraseRules = pgTable('phrase_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Rule type: blacklist | cooldown | preferred | forbidden_opening */
  type: text('type').notNull(),
  value: text('value').notNull(),
  cooldownSec: integer('cooldown_sec'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
