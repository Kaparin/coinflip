# CoinFlip AI Bot — Architecture & Admin Guide

## Overview

The AI Bot is the live host of CoinFlip on Axiome blockchain. It comments on bets, wins, losses, streaks, jackpots, and interacts in the global chat — making every flip feel more important and the entire game more alive.

The bot uses OpenAI GPT models with a layered prompt system: **Base System Prompt** + **Persona Overlay** + **Structured Event Context** + **Anti-Repeat Injection**.

---

## Architecture

```
Event (bet resolved, big bet, chat mention, jackpot, silence)
  │
  ├─ Event Classifier → determines EventType
  ├─ Trigger Router → checks cooldown, probability, min threshold
  ├─ Persona Resolver → trigger mapping → active persona → first enabled
  │   └─ Schedule Check → skip if persona outside its schedule window
  ├─ Prompt Composer → base prompt + persona overlay + style levels + preferred phrases + anti-repeat
  ├─ GPT Call → model + temperature from config
  ├─ Response Validator → JSON parse, ru/en check, length limit, safety check, phrase rules
  ├─ Anti-Repeat Check → Jaccard similarity + same-opening detection (up to 2 retries)
  ├─ Phrase Rules Check → blacklist, forbidden openings, cooldown phrases
  ├─ Player Memory → enrich future prompts with player context
  └─ Delivery → save to DB + broadcast via WebSocket
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/ai-bot.service.ts` | Core bot service — all logic |
| `apps/api/src/routes/admin.ts` | Admin API endpoints (config, preview, phrase rules, stats) |
| `apps/web/src/app/admin/tabs/ai-bot.tsx` | Admin panel UI (8 tabs) |
| `packages/db/src/schema/ai-bot.ts` | DB schema (Drizzle) |
| `apps/web/src/components/features/ticker/ai-ticker.tsx` | Frontend ticker display |
| `apps/web/src/components/features/social/social-sheet.tsx` | Chat rendering (bot avatar/nameColor) |

### Database Tables

| Table | Purpose |
|-------|---------|
| `ai_bot_config` | Single-row config (prompts, personas, triggers, style levels, safety) |
| `ai_commentary` | Generated ticker commentary per bet |
| `ai_bot_message_log` | Detailed log of all bot outputs (for analytics) |
| `phrase_rules` | Phrase quality control rules (blacklist, cooldown, preferred, forbidden) |

---

## 12 Personas

Each persona is a style overlay — it changes tone and flavor without duplicating rules or format.

| # | ID | Name | Style | Default Trigger |
|---|---|------|-------|----------------|
| 1 | `oracle_classic` | Oracle Classic | Premium, dark, confident arena host | Regular bets, silence, announcements |
| 2 | `street_hype` | Street Hype | Fast, bold underground swagger | Win streaks |
| 3 | `midnight_showman` | Midnight Showman | Smooth, witty late-night host | Chat replies |
| 4 | `deadpan_comedian` | Deadpan Comedian | Dry humor, subtle sarcasm | Loss comments |
| 5 | `imperial_herald` | Imperial Herald | Grand ceremonial announcer | Big bets, jackpots |
| 6 | `mystic_volhv` | Mystic Volhv | Cryptic seer, omens and destiny | Fairness replies |
| 7 | `sports_fury` | Sports Fury | Energetic sports commentator | Win comments |
| 8 | `rap_mc` | Rap MC | Rhythmic battle-night host | (disabled by default) |
| 9 | `velvet_diva` | Velvet Diva | Glamorous, sharp, flamboyant | (disabled by default) |
| 10 | `boss_uncle` | Boss Uncle | Calm veteran authority | (disabled by default) |
| 11 | `luxury_casino_host` | Luxury Casino Host | Refined high-stakes room master | Huge bets |
| 12 | `chaos_lite` | Chaos Lite | Playful mischief and hype | Upsets |

### Persona Identity (Chat)

Each persona can have:
- **displayName** — shown as nickname in chat (e.g., "Street Oracle")
- **avatarUrl** — custom avatar image URL
- **nameColor** — hex color for the nickname in chat

### Persona Scheduling

Each persona can have an optional schedule:
- **days** — array of weekdays (0=Sun, 6=Sat)
- **startHour / endHour** — active time window (0-23)
- **timezone** — e.g. "Europe/Moscow", "UTC"

If a persona is outside its schedule, the resolver skips it and falls back to the next candidate.

---

## Event Types & Trigger Mapping

| Event Type | Description | Default Persona |
|-----------|-------------|----------------|
| `bet_comment` | Regular bet resolved | Oracle Classic |
| `big_bet` | Bet >= bigBetThreshold | Imperial Herald |
| `huge_bet` | Bet >= bigBetThreshold × 4 | Luxury Casino Host |
| `win_comment` | Winner perspective | Sports Fury |
| `loss_comment` | Loser perspective | Deadpan Comedian |
| `streak_comment` | Win streak >= streakThreshold | Street Hype |
| `upset_comment` | Unexpected upset | Chaos Lite |
| `chat_reply` | @mention in global chat | Midnight Showman |
| `fairness_reply` | Fairness question | Mystic Volhv |
| `silence` | Chat quiet > silenceMinutes | Oracle Classic |
| `jackpot` | Jackpot winner drawn | Imperial Herald |
| `system_announcement` | System event | Oracle Classic |

Each trigger has:
- **enabled** — on/off
- **cooldownSec** — minimum seconds between fires
- **probability** — 0-100% chance to fire
- **minBetThreshold** — minimum bet amount to trigger

---

## Integration Points

The bot is called from these backend services:

| Caller | Method | Event |
|--------|--------|-------|
| `indexer.ts` | `onBetResolved()` | Every resolved bet → ticker commentary |
| `indexer.ts` | `onWinStreak()` | After reveal, if streak >= threshold → chat message |
| `background-tasks.ts` | `onBigBetCreated()` | After bet confirmed on chain → chat message |
| `jackpot.service.ts` | `onJackpotWon()` | After jackpot drawn → chat message |
| `chat.service.ts` | `onChatMessage()` | On @mention in global chat → chat reply |
| Internal timer | `postSilenceMessage()` | Every 30min check, fires if chat quiet > silenceMinutes |

---

## Anti-Repeat System

Three-layer protection:

1. **RecentPhrasesBuffer** (in-memory ring buffer, configurable size via `antiRepeatCount`):
   - Exact match detection
   - Jaccard word similarity > 70% → reject
   - Same first 5 words → reject
   - Up to 2 auto-retries on rejection

2. **Phrase Rules** (DB-backed):
   - `blacklist` — text containing this phrase is always rejected
   - `forbidden_opening` — text starting with this phrase is rejected
   - `cooldown` — phrase can only be used once per `cooldownSec` seconds
   - `preferred` — injected into system prompt as optional branded phrases

3. **Recent phrases injection** — last 5 generated phrases are appended to the system prompt with "AVOID these" instruction.

---

## Safety Layer

### Built-in patterns (always active):
- "guaranteed win/profit/money"
- "financial advice"
- "you will definitely/certainly win"
- "invest now/today"

### Configurable:
- **bannedPhrases** — array of exact substring matches (case-insensitive)
- **softBannedPatterns** — array of regex patterns
- **profanityFilter** — toggle (reserved for future extension)

### Safety Modes:
| Mode | Commentary | Chat Bot | Chat Reply |
|------|-----------|----------|------------|
| `strict` | Yes | Yes (strict filtering) | Yes |
| `playful` | Yes | Yes (relaxed) | Yes |
| `safe_chat` | Yes | Yes | Yes (default) |
| `event_only` | Yes | No | No |
| `chat_read_only` | Yes | No | No |

---

## Style Controls

All configurable from admin panel:

| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Temperature | 0.1 - 2.0 | 0.95 | OpenAI temperature parameter |
| Emoji Intensity | 0 - 3 | 1 | Injected as hint into system prompt |
| Humor Level | 0 - 5 | 3 | Injected as hint |
| Drama Level | 0 - 5 | 3 | Injected as hint |
| Sarcasm Level | 0 - 5 | 2 | Injected as hint |
| Premium Level | 0 - 5 | 3 | Injected as hint |
| Fairness Mentions | toggle | on | Allow fairness references |

---

## Player Memory (Lite)

In-memory LRU cache (max 200 players). Tracks:
- Last result (win/loss)
- Current streak count
- Last bet amount
- Total recent bets

This context is injected into event prompts, allowing the bot to say things like "Player X is on a 4-win streak" or "Player Y just lost their last bet — this could be their redemption."

Memory is not persisted — resets on server restart. This is intentional to keep it lightweight.

---

## Admin Panel (8 Tabs)

### General
- Bot toggles (commentary, chat bot)
- Model selection, bot name
- System prompt editor
- Extra context
- **Style Levels** — sliders for temperature, emoji, humor, drama, sarcasm, premium
- **Safety** — mode selector, banned phrases, soft-banned patterns

### Personas
- Collapsible cards for each persona
- Edit: name, slug, color, priority, description, prompt overlay
- Identity: display name, avatar URL, nick color
- Schedule: days, hours, timezone
- Actions: enable/disable, set active, clone, delete

### Triggers
- Event → Persona mapping table
- Per-trigger: enabled, cooldown, probability

### Phrases
- CRUD for phrase rules
- Grouped by type with color coding
- Inline toggle/edit/delete
- Cooldown phrases show seconds input

### Preview
- Select event type, persona, fill in player/amount/streak
- Generate preview (not saved to DB)
- Raw prompt debug view
- **A/B Compare** — test two personas on the same event side-by-side

### History
- Recent commentary + chat messages
- Event type & persona badges
- Regeneration flag, similarity score
- Expandable input context JSON

### Analytics
- Total commentary & chat messages
- Messages by event type (bar chart)
- Messages by persona (bar chart)
- Persona usage from message log
- Average output length
- Regeneration rate

### Actions
- Reset to default prompt/personas/triggers
- Clear all commentary
- Clear all bot chat messages

---

## Output Contract

The bot always returns strict JSON:

```json
{"ru": "Короткий живой комментарий", "en": "Short vivid commentary"}
```

Rules:
- Max 2 short sentences per language
- No markdown, no code fences, no explanations
- 0-2 emojis max
- Russian and English equal in energy (not word-for-word)
- Player nicknames are NEVER translated

---

## API Endpoints

All under `GET/POST/PUT/DELETE /api/v1/admin/ai-bot/*` (admin-only):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Get bot config |
| PUT | `/config` | Update config (partial) |
| GET | `/commentary` | Recent commentary |
| DELETE | `/commentary` | Clear all commentary |
| GET | `/chat-messages` | Recent bot chat messages |
| DELETE | `/chat-messages` | Clear bot chat messages |
| GET | `/stats` | Analytics data |
| GET | `/message-log` | Detailed message log |
| POST | `/preview` | Generate test response |
| GET | `/defaults` | Get default prompt/personas/triggers |
| GET | `/phrase-rules` | List all phrase rules |
| POST | `/phrase-rules` | Create phrase rule |
| PUT | `/phrase-rules/:id` | Update phrase rule |
| DELETE | `/phrase-rules/:id` | Delete phrase rule |
