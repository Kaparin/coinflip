import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { wsService } from './ws.service.js';

// ─── Types ──────────────────────────────────────────────

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

interface Persona {
  id: string;
  name: string;
  prompt: string;
}

interface BetContext {
  betId: string;
  makerNickname: string;
  acceptorNickname: string;
  amount: string; // display units
  winnerNickname: string;
  loserNickname: string;
  side: string;   // 'heads' | 'tails'
  winnerSide: string;
  payoutAmount: string;
}

interface ChatTriggerContext {
  type: 'mention' | 'big_bet' | 'streak' | 'silence' | 'jackpot';
  message?: string;        // user message if mention
  userNickname?: string;
  betAmount?: string;
  streakCount?: number;
  jackpotAmount?: string;
  jackpotWinner?: string;
}

// ─── Default system prompt ──────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are the Oracle — the charismatic host of CoinFlip, a PvP coin-flip betting game on Axiome blockchain.

Personality:
- Confident, witty, dramatic — like a sports commentator mixed with a casino host
- Use short, punchy sentences. Max 2 sentences per response.
- Add light humor and irony. Never be mean or offensive.
- Build hype around big bets and win streaks.
- Never give financial advice or predict outcomes seriously.
- You can use 1-2 relevant emojis per message, but don't overdo it.

Game context:
- Players bet COIN tokens on heads or tails
- Winner gets 2x stake minus 10% commission
- The game uses commit-reveal for fairness (provably fair)

IMPORTANT: Always respond with a JSON object containing both languages:
{"ru": "Russian text here", "en": "English text here"}

CRITICAL: NEVER translate player nicknames. Always keep nicknames exactly as they are — if a player is called "CryptoKing", write "CryptoKing" in both ru and en versions. Nicknames are proper names, not translatable words.`;

// ─── Service ────────────────────────────────────────────

class AiBotService {
  private db = getDb();
  private config: BotConfig | null = null;
  private configLoadedAt = 0;
  private lastChatMessageAt = 0;
  private lastSilenceCheckAt = 0;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;

  // System user ID for the bot (lazy-initialized)
  private botUserId: string | null = null;

  /** Load or return cached config (refreshes every 60s) */
  async getConfig(): Promise<BotConfig> {
    const now = Date.now();
    if (this.config && now - this.configLoadedAt < 60_000) {
      return this.config;
    }

    const rows = await this.db.execute(sql`
      SELECT * FROM ai_bot_config LIMIT 1
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length === 0) {
      // Create default config
      await this.db.execute(sql`
        INSERT INTO ai_bot_config (system_prompt, personas)
        VALUES (${DEFAULT_SYSTEM_PROMPT}, '[]'::jsonb)
        ON CONFLICT DO NOTHING
      `);
      this.config = {
        commentaryEnabled: true,
        chatBotEnabled: true,
        botName: 'Oracle',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        personas: [],
        activePersonaId: null,
        model: 'gpt-4o-mini',
        chatCooldownSec: 30,
        bigBetThreshold: 500,
        streakThreshold: 3,
        silenceMinutes: 15,
        respondToMentions: true,
        reactToBigBets: true,
        reactToStreaks: true,
        postOnSilence: true,
        extraContext: '',
      };
    } else {
      const r = rawRows[0]!;
      this.config = {
        commentaryEnabled: r.commentary_enabled === true,
        chatBotEnabled: r.chat_bot_enabled === true,
        botName: String(r.bot_name ?? 'Oracle'),
        systemPrompt: String(r.system_prompt ?? DEFAULT_SYSTEM_PROMPT),
        personas: Array.isArray(r.personas) ? r.personas as Persona[] : [],
        activePersonaId: r.active_persona_id ? String(r.active_persona_id) : null,
        model: String(r.model ?? 'gpt-4o-mini'),
        chatCooldownSec: Number(r.chat_cooldown_sec ?? 30),
        bigBetThreshold: Number(r.big_bet_threshold ?? 500),
        streakThreshold: Number(r.streak_threshold ?? 3),
        silenceMinutes: Number(r.silence_minutes ?? 15),
        respondToMentions: r.respond_to_mentions === true,
        reactToBigBets: r.react_to_big_bets === true,
        reactToStreaks: r.react_to_streaks === true,
        postOnSilence: r.post_on_silence === true,
        extraContext: String(r.extra_context ?? ''),
      };
    }

    this.configLoadedAt = now;
    return this.config;
  }

  /** Force config reload (called after admin update) */
  invalidateConfig() {
    this.configLoadedAt = 0;
    this.config = null;
  }

  /** Get or create system user for the bot */
  private async getBotUserId(): Promise<string> {
    if (this.botUserId) return this.botUserId;

    const rows = await this.db.execute(sql`
      SELECT id::text FROM users WHERE address = 'system_oracle'
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length > 0) {
      this.botUserId = String(rawRows[0]!.id);
      return this.botUserId;
    }

    // Create system user
    const insertRows = await this.db.execute(sql`
      INSERT INTO users (address, profile_nickname)
      VALUES ('system_oracle', 'Oracle')
      ON CONFLICT (address) DO UPDATE SET profile_nickname = 'Oracle'
      RETURNING id::text
    `);
    const rawInsert = (Array.isArray(insertRows) ? insertRows : (insertRows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    this.botUserId = String(rawInsert[0]!.id);
    return this.botUserId;
  }

  /** Build the effective system prompt (base + active persona + extra context) */
  private buildSystemPrompt(config: BotConfig): string {
    let prompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Overlay active persona
    if (config.activePersonaId && config.personas.length > 0) {
      const persona = config.personas.find(p => p.id === config.activePersonaId);
      if (persona) {
        prompt += `\n\nActive persona: "${persona.name}"\n${persona.prompt}`;
      }
    }

    if (config.extraContext) {
      prompt += `\n\nAdditional context from admin:\n${config.extraContext}`;
    }

    return prompt;
  }

  /** Call OpenAI API */
  private async callGPT(systemPrompt: string, userPrompt: string, model?: string): Promise<{ ru: string; en: string } | null> {
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
          max_tokens: 200,
          temperature: 0.9,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'OpenAI API error');
        return null;
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn({ content }, 'AI response not in expected JSON format');
        // Fallback: use content as both languages
        return { ru: content, en: content };
      }

      const parsed = JSON.parse(jsonMatch[0]) as { ru?: string; en?: string };
      return {
        ru: parsed.ru ?? content,
        en: parsed.en ?? content,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to call OpenAI API');
      return null;
    }
  }

  // ─── Commentary (ticker) ─────────────────────────────

  /** Generate commentary for a resolved bet */
  async onBetResolved(context: BetContext): Promise<void> {
    const config = await this.getConfig();
    if (!config.commentaryEnabled) return;

    const systemPrompt = this.buildSystemPrompt(config) + `

TASK: Generate a short, dramatic commentary for a just-resolved coin flip bet.
Keep it to 1-2 sentences. Be entertaining and varied — don't repeat the same patterns.
CRITICAL: NEVER translate player nicknames — keep them exactly as provided.`;

    const userPrompt = `Bet resolved:
- ${context.makerNickname} vs ${context.acceptorNickname}
- Stake: ${context.amount} COIN each
- Result: ${context.winnerSide} (${context.side === 'heads' ? 'орёл' : 'решка'})
- Winner: ${context.winnerNickname} takes ${context.payoutAmount} COIN
- Loser: ${context.loserNickname}

Generate commentary as JSON: {"ru": "...", "en": "..."}`;

    const result = await this.callGPT(systemPrompt, userPrompt, config.model);
    if (!result) return;

    // Save to DB
    try {
      await this.db.execute(sql`
        INSERT INTO ai_commentary (bet_id, text_ru, text_en)
        VALUES (${context.betId}, ${result.ru}, ${result.en})
      `);

      // Broadcast to all clients
      wsService.broadcast({
        type: 'ai_commentary',
        data: {
          betId: context.betId,
          textRu: result.ru,
          textEn: result.en,
          createdAt: new Date().toISOString(),
        },
      });

      logger.info({ betId: context.betId }, 'AI commentary generated');
    } catch (err) {
      logger.error({ err, betId: context.betId }, 'Failed to save AI commentary');
    }
  }

  /** Get recent commentary for ticker initialization */
  async getRecentCommentary(limit = 10): Promise<Array<{ betId: string; textRu: string; textEn: string; createdAt: string }>> {
    const rows = await this.db.execute(sql`
      SELECT bet_id, text_ru, text_en, created_at
      FROM ai_commentary
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
    return rawRows.map(r => ({
      betId: String(r.bet_id),
      textRu: String(r.text_ru),
      textEn: String(r.text_en),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  // ─── Chat Bot ────────────────────────────────────────

  /** Handle incoming chat message — check if bot should respond */
  async onChatMessage(message: string, senderNickname: string, senderAddress: string): Promise<void> {
    const config = await this.getConfig();
    if (!config.chatBotEnabled) return;

    // Don't respond to own messages
    if (senderAddress === 'system_oracle') return;

    // Global cooldown
    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    // Check triggers
    const botNameLower = config.botName.toLowerCase();
    const mentionPatterns = [
      `@${botNameLower}`,
      `@оракул`,
      `@oracle`,
      `@бот`,
      `@bot`,
    ];

    const msgLower = message.toLowerCase();
    const isMention = config.respondToMentions && mentionPatterns.some(p => msgLower.includes(p));

    if (!isMention) return; // Only respond to direct mentions in chat

    await this.postChatResponse({
      type: 'mention',
      message,
      userNickname: senderNickname,
    });
  }

  /** React to a big bet being created */
  async onBigBetCreated(nickname: string, amount: string): Promise<void> {
    const config = await this.getConfig();
    if (!config.chatBotEnabled || !config.reactToBigBets) return;

    const amountNum = Number(amount);
    if (amountNum < config.bigBetThreshold) return;

    // Global cooldown
    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    await this.postChatResponse({
      type: 'big_bet',
      userNickname: nickname,
      betAmount: amount,
    });
  }

  /** React to a win streak */
  async onWinStreak(nickname: string, streakCount: number): Promise<void> {
    const config = await this.getConfig();
    if (!config.chatBotEnabled || !config.reactToStreaks) return;
    if (streakCount < config.streakThreshold) return;

    const now = Date.now();
    if (now - this.lastChatMessageAt < config.chatCooldownSec * 1000) return;

    await this.postChatResponse({
      type: 'streak',
      userNickname: nickname,
      streakCount,
    });
  }

  /** React to jackpot win */
  async onJackpotWon(nickname: string, amount: string): Promise<void> {
    const config = await this.getConfig();
    if (!config.chatBotEnabled) return;

    await this.postChatResponse({
      type: 'jackpot',
      jackpotWinner: nickname,
      jackpotAmount: amount,
    });
  }

  /** Post a conversation starter after silence */
  private async postSilenceMessage(): Promise<void> {
    const config = await this.getConfig();
    if (!config.chatBotEnabled || !config.postOnSilence) return;

    // Check last chat message time from DB
    const rows = await this.db.execute(sql`
      SELECT created_at FROM global_chat_messages
      ORDER BY created_at DESC LIMIT 1
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    if (rawRows.length > 0) {
      const lastMsgTime = new Date(String(rawRows[0]!.created_at)).getTime();
      const silenceMs = config.silenceMinutes * 60 * 1000;
      if (Date.now() - lastMsgTime < silenceMs) return;
    }

    await this.postChatResponse({ type: 'silence' });
  }

  /** Generate and post a chat response */
  private async postChatResponse(context: ChatTriggerContext): Promise<void> {
    const config = await this.getConfig();
    const systemPrompt = this.buildSystemPrompt(config) + `

TASK: You are posting in the global chat of CoinFlip game.
Keep responses short (1-2 sentences), witty, and in-character.
CRITICAL: NEVER translate player nicknames — keep them exactly as provided.
Response format: {"ru": "...", "en": "..."}`;

    let userPrompt = '';
    switch (context.type) {
      case 'mention':
        userPrompt = `A user "${context.userNickname}" mentioned you in chat: "${context.message}"
Reply naturally and in-character. Be helpful but playful.`;
        break;
      case 'big_bet':
        userPrompt = `Player "${context.userNickname}" just created a big bet: ${context.betAmount} COIN!
React to this high-stakes action in the chat. Build hype!`;
        break;
      case 'streak':
        userPrompt = `Player "${context.userNickname}" is on a ${context.streakCount}-win streak!
Comment on their hot streak. Be impressed but add a hint of "can it last?"`;
        break;
      case 'jackpot':
        userPrompt = `JACKPOT HIT! Player "${context.jackpotWinner}" won ${context.jackpotAmount} COIN from the jackpot!
Celebrate this epic moment! Go big!`;
        break;
      case 'silence':
        userPrompt = `The chat has been quiet for a while. Post a conversation starter.
Maybe tease about the game, ask a playful question, or challenge someone to play.
Be natural — don't say "the chat is quiet" literally.`;
        break;
    }

    const result = await this.callGPT(systemPrompt, userPrompt, config.model);
    if (!result) return;

    this.lastChatMessageAt = Date.now();

    try {
      const botUserId = await this.getBotUserId();

      // Insert chat message from bot
      const rows = await this.db.execute(sql`
        INSERT INTO global_chat_messages (user_id, message, style, effect)
        VALUES (${botUserId}, ${result.ru + '\n---\n' + result.en}, 'ai_bot', null)
        RETURNING id::text, created_at
      `);
      const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
      const row = rawRows[0]!;

      // Broadcast as chat message
      wsService.emitChatMessage({
        id: String(row.id),
        userId: botUserId,
        address: 'system_oracle',
        nickname: config.botName,
        vipTier: 'ai',
        message: result.ru + '\n---\n' + result.en,
        style: 'ai_bot',
        effect: null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        textRu: result.ru,
        textEn: result.en,
      });

      logger.info({ trigger: context.type }, 'AI bot posted chat message');
    } catch (err) {
      logger.error({ err, trigger: context.type }, 'Failed to post AI bot message');
    }
  }

  // ─── Silence watcher ─────────────────────────────────

  /** Start periodic silence check */
  startSilenceWatcher() {
    if (this.silenceTimer) return;
    // Check every 5 minutes
    this.silenceTimer = setInterval(() => {
      this.postSilenceMessage().catch(err =>
        logger.error({ err }, 'Silence watcher error'));
    }, 5 * 60 * 1000);
    logger.info('AI bot silence watcher started');
  }

  stopSilenceWatcher() {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // ─── Win streak helper ───────────────────────────────

  /** Count consecutive wins for a user (called after bet resolved) */
  async getWinStreak(userId: string): Promise<number> {
    const rows = await this.db.execute(sql`
      SELECT status, winner_user_id
      FROM bets
      WHERE (maker_user_id = ${userId} OR acceptor_user_id = ${userId})
        AND status = 'revealed'
      ORDER BY resolved_time DESC
      LIMIT 20
    `);
    const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

    let streak = 0;
    for (const row of rawRows) {
      if (String(row.winner_user_id) === userId) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // ─── Admin API helpers ───────────────────────────────

  async updateConfig(updates: Partial<BotConfig>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    // Build dynamic update — only set provided fields
    if (updates.commentaryEnabled !== undefined) {
      setClauses.push(`commentary_enabled = ${updates.commentaryEnabled}`);
    }
    if (updates.chatBotEnabled !== undefined) {
      setClauses.push(`chat_bot_enabled = ${updates.chatBotEnabled}`);
    }
    if (updates.botName !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET bot_name = ${updates.botName}`);
    }
    if (updates.systemPrompt !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET system_prompt = ${updates.systemPrompt}`);
    }
    if (updates.model !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET model = ${updates.model}`);
    }
    if (updates.chatCooldownSec !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET chat_cooldown_sec = ${updates.chatCooldownSec}`);
    }
    if (updates.bigBetThreshold !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET big_bet_threshold = ${updates.bigBetThreshold}`);
    }
    if (updates.streakThreshold !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET streak_threshold = ${updates.streakThreshold}`);
    }
    if (updates.silenceMinutes !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET silence_minutes = ${updates.silenceMinutes}`);
    }
    if (updates.respondToMentions !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET respond_to_mentions = ${updates.respondToMentions}`);
    }
    if (updates.reactToBigBets !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET react_to_big_bets = ${updates.reactToBigBets}`);
    }
    if (updates.reactToStreaks !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET react_to_streaks = ${updates.reactToStreaks}`);
    }
    if (updates.postOnSilence !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET post_on_silence = ${updates.postOnSilence}`);
    }
    if (updates.extraContext !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET extra_context = ${updates.extraContext}`);
    }
    if (updates.activePersonaId !== undefined) {
      await this.db.execute(sql`UPDATE ai_bot_config SET active_persona_id = ${updates.activePersonaId}`);
    }
    if (updates.personas !== undefined) {
      const jsonStr = JSON.stringify(updates.personas);
      await this.db.execute(sql`UPDATE ai_bot_config SET personas = ${jsonStr}::jsonb`);
    }

    await this.db.execute(sql`UPDATE ai_bot_config SET updated_at = NOW()`);
    this.invalidateConfig();
  }
}

export const aiBotService = new AiBotService();
