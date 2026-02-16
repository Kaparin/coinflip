# CoinFlip — Project Status & Production Roadmap

> **Последнее обновление:** 15 февраля 2026
> **Стадия:** Development Complete → Pre-Production

---

## 1. Обзор проекта

**CoinFlip** — PvP (Player vs Player) игра «Подбрасывание монетки» на блокчейне Axiome Chain.
Два игрока ставят LAUNCH-токены, один из них выигрывает 90% (10% комиссия платформы).

### Ключевые принципы
- **Provably Fair** — commit-reveal схема, результат определяется криптографически
- **Non-custodial** — мнемоника никогда не покидает браузер (клиентское AES-256-GCM шифрование)
- **Delegated Execution** — транзакции подписываются через relayer (Cosmos x/authz)
- **Real-time** — WebSocket обновления для всех подключённых клиентов

### Технический стек

| Слой | Технология |
|------|-----------|
| Smart Contract | Rust / CosmWasm 1.5 |
| Blockchain | Axiome Chain (Cosmos SDK, chain-id: `axiome-1`) |
| Backend API | Node.js + Hono + TypeScript |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Cache | Redis 7 |
| Frontend | Next.js 15 (Turbopack) + React 19 + Tailwind CSS |
| Real-time | WebSocket (ws library, noServer mode) |
| Monorepo | pnpm workspaces + Turborepo |
| API Client | Auto-generated via Orval from OpenAPI spec |
| Token | LAUNCH (CW20) |
| Native coin | AXM (uaxm) — используется для газа |

---

## 2. Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   API (Hono)  │────▶│  PostgreSQL DB   │
│  Next.js 15  │◀────│  port :3001   │◀────│  port :5433      │
│  port :3000  │     │               │     └─────────────────┘
└──────┬───────┘     │  ┌─────────┐  │
       │             │  │ Relayer │  │────▶ Axiome Chain (RPC :26657)
       │  WebSocket  │  │ Service │  │◀──── Axiome Chain (REST :1317)
       └────────────▶│  └─────────┘  │
                     │  ┌─────────┐  │
                     │  │ Indexer │  │     ┌──────────┐
                     │  │ Service │  │────▶│  Redis    │
                     │  └─────────┘  │     │ port:6379 │
                     └──────────────┘     └──────────┘
```

### Поток игры (Game Flow)

```
1. Maker → CreateBet (commit hash + amount)
   ├─ Vault: lock funds
   └─ Event: bet_created

2. Taker → AcceptBet (bet_id + guess: heads/tails)
   ├─ Vault: lock funds
   ├─ Event: bet_accepted
   └─ Timer: reveal_deadline = now + 300s

3. Auto-Reveal → Reveal (bet_id + side + secret)
   ├─ Contract verifies: SHA256(side || secret) == commitment
   ├─ Winner = (maker_side == acceptor_guess) ? acceptor : maker
   ├─ Payout: 90% to winner, 10% commission to treasury
   └─ Event: bet_revealed

4. Timeout → ClaimTimeout (if maker doesn't reveal in 5 min)
   ├─ Acceptor wins by default
   └─ Event: bet_timeout_claimed

5. Cancel → CancelBet (only if bet is still open/unaccepted)
   ├─ Vault: unlock funds
   └─ Event: bet_canceled
```

---

## 3. Структура монорепозитория

```
coinflip/
├── apps/
│   ├── api/                      # Backend API (Hono + Node.js)
│   │   └── src/
│   │       ├── config/env.ts     # Environment validation (Zod)
│   │       ├── routes/           # API routes
│   │       │   ├── bets.ts       # /api/v1/bets — CRUD + relay
│   │       │   ├── vault.ts      # /api/v1/vault — deposit/withdraw
│   │       │   ├── auth.ts       # /api/v1/auth — wallet connect
│   │       │   ├── users.ts      # /api/v1/users — leaderboard
│   │       │   ├── admin.ts      # /api/v1/admin — treasury mgmt
│   │       │   └── ws.ts         # WebSocket setup (noServer)
│   │       ├── services/
│   │       │   ├── relayer.ts           # Delegated tx execution (MsgExec)
│   │       │   ├── sequence-manager.ts  # Mutex-based sequence tracking
│   │       │   ├── indexer.ts           # Blockchain event indexer
│   │       │   ├── bet.service.ts       # Bet business logic
│   │       │   ├── vault.service.ts     # Vault balance management
│   │       │   ├── ws.service.ts        # WebSocket broadcast service
│   │       │   ├── treasury.service.ts  # Treasury/admin operations
│   │       │   ├── user.service.ts      # User stats & leaderboard
│   │       │   ├── event.service.ts     # Transaction event tracking
│   │       │   └── commitment.service.ts # Commitment hash utilities
│   │       ├── middleware/
│   │       │   ├── auth.ts              # Wallet address auth
│   │       │   ├── admin.ts             # Admin-only middleware
│   │       │   └── error-handler.ts     # Global error handling
│   │       └── lib/
│   │           ├── db.ts                # Database singleton
│   │           ├── errors.ts            # AppError types (400-504)
│   │           └── logger.ts            # Pino logger
│   │
│   └── web/                      # Frontend (Next.js 15)
│       └── src/
│           ├── app/
│           │   ├── page.tsx             # Landing page
│           │   ├── game/page.tsx        # Main game page
│           │   ├── admin/page.tsx       # Admin dashboard
│           │   ├── layout.tsx           # Root layout
│           │   └── providers.tsx        # React Query + Wallet + Toast
│           ├── components/
│           │   ├── features/
│           │   │   ├── bets/            # Bet UI components
│           │   │   │   ├── create-bet-form.tsx
│           │   │   │   ├── bet-card.tsx
│           │   │   │   ├── bet-list.tsx
│           │   │   │   ├── my-bets.tsx
│           │   │   │   └── coin-flip-animation.tsx
│           │   │   ├── vault/balance-display.tsx
│           │   │   ├── auth/
│           │   │   │   ├── connect-wallet-modal.tsx
│           │   │   │   └── onboarding-modal.tsx
│           │   │   ├── leaderboard/leaderboard.tsx
│           │   │   └── history/history-list.tsx
│           │   ├── layout/
│           │   │   ├── header.tsx        # Header + wallet dropdown
│           │   │   └── bottom-nav.tsx    # Mobile bottom navigation
│           │   └── ui/                   # Reusable UI primitives
│           │       ├── button.tsx, input.tsx, card.tsx
│           │       ├── modal.tsx, badge.tsx, skeleton.tsx
│           │       └── toast.tsx
│           ├── hooks/
│           │   ├── use-websocket.ts      # Stable WS connection
│           │   ├── use-auto-reveal.ts    # Auto-reveal with retry
│           │   ├── use-web-wallet.ts     # Custom web wallet (mnemonic)
│           │   ├── use-wallet-balance.ts # CW20 balance query
│           │   ├── use-leaderboard.ts    # Leaderboard data
│           │   ├── use-grant-status.ts   # Authz grant check
│           │   ├── use-admin.ts          # Admin API hooks
│           │   └── use-commitment.ts     # Commitment generation
│           ├── contexts/
│           │   └── wallet-context.tsx    # Global wallet state
│           └── lib/
│               ├── constants.ts         # App constants (URLs, keys)
│               ├── wallet-core.ts       # Crypto: AES-256-GCM, PBKDF2
│               ├── wallet-signer.ts     # CosmJS signing via proxy
│               └── format.ts            # Token formatting utilities
│
├── contracts/
│   └── coinflip-pvp-vault/       # CosmWasm smart contract (Rust)
│       ├── src/
│       │   ├── contract.rs       # Entry points (instantiate/execute/query)
│       │   ├── msg.rs            # Message types
│       │   ├── state.rs          # On-chain state (bets, vault, config)
│       │   ├── error.rs          # Contract errors
│       │   └── lib.rs
│       ├── artifacts/            # Compiled .wasm
│       └── Cargo.toml
│
├── packages/
│   ├── db/                       # Database schema (Drizzle ORM)
│   │   └── src/schema/
│   │       ├── bets.ts           # bets table
│   │       ├── users.ts          # users table
│   │       ├── vault-balances.ts # vault_balances table
│   │       ├── sessions.ts       # sessions table
│   │       ├── tx-events.ts      # tx_events table (deduplication)
│   │       └── treasury-ledger.ts # treasury_ledger table
│   ├── api-client/               # Auto-generated API client (Orval)
│   ├── shared/                   # Shared types (WsEvent, etc.)
│   ├── eslint-config/            # Shared ESLint configs
│   └── tsconfig/                 # Shared TypeScript configs
│
├── scripts/                      # Deployment & test scripts
│   ├── deploy-contract.ts        # Deploy smart contract
│   ├── grant-authz.ts            # Grant x/authz permissions
│   ├── test-game-cycle.ts        # Full game cycle test
│   ├── deposit-test.ts           # Test vault deposit
│   ├── test-withdraw.ts          # Test vault withdraw
│   ├── cancel-chain-bet.ts       # Cancel bet on chain
│   ├── claim-timeout.ts          # Claim timeout on chain
│   ├── check-test-accounts.ts    # Check account balances
│   ├── sync-balances.ts          # Sync vault balances
│   └── verify-contract.ts        # Verify contract state
│
├── tooling/
│   └── openapi/                  # OpenAPI spec generation
│
├── docker-compose.yml            # PostgreSQL + Redis
├── pnpm-workspace.yaml
├── turbo.json
└── .env / .env.example
```

---

## 4. Смарт-контракт (CosmWasm)

### Развёрнут на Axiome Chain

| Параметр | Значение |
|----------|---------|
| Адрес контракта | `axm1mr5l8e49kav3mw026llr8qacuqfq0yeye8zuqcwr2866xkeufptssftk9y` |
| CW20 Token (LAUNCH) | Адрес в .env (`LAUNCH_CW20_ADDR`) |
| Chain ID | `axiome-1` |
| Комиссия | 10% (1000 bps) |
| Таймаут reveal | 300 секунд (5 минут) |
| Минимальная ставка | Настраивается через UpdateConfig |

### Execute Messages
- `Receive(Cw20ReceiveMsg)` — CW20 deposit в vault
- `Withdraw { amount }` — вывод из vault
- `CreateBet { amount, commitment }` — создать ставку (commit hash)
- `AcceptBet { bet_id, guess }` — принять ставку
- `Reveal { bet_id, side, secret }` — раскрыть результат
- `CancelBet { bet_id }` — отменить ставку
- `ClaimTimeout { bet_id }` — забрать по таймауту
- `UpdateConfig { ... }` — обновить параметры (admin only)
- `TransferAdmin / AcceptAdmin` — передача прав админа

### Query Messages
- `Config {}` — текущая конфигурация
- `VaultBalance { address }` — баланс в vault
- `Bet { bet_id }` — информация о ставке
- `OpenBets { start_after, limit }` — открытые ставки
- `UserBets { address, start_after, limit }` — ставки пользователя

---

## 5. База данных (PostgreSQL)

### Таблицы

| Таблица | Назначение |
|---------|-----------|
| `users` | Аккаунты (address, nickname, created_at) |
| `bets` | Ставки (maker, acceptor, amount, status, commitment, reveal, winner, tx hashes) |
| `vault_balances` | Балансы vault (available, locked) |
| `sessions` | Сессии подключения |
| `tx_events` | Индексированные блокчейн-события (дедупликация) |
| `treasury_ledger` | Журнал комиссий и выводов казны |

### Статусы ставок
- `open` — ожидает принятия
- `accepted` — принята, ожидает reveal
- `revealed` — результат раскрыт, определён победитель
- `canceled` — отменена создателем
- `timeout_claimed` — таймаут, акцептор победил

---

## 6. API Endpoints

### Public
| Method | Path | Описание |
|--------|------|---------|
| GET | `/api/v1/bets` | Список открытых ставок (с пагинацией) |
| GET | `/api/v1/bets/:id` | Информация о конкретной ставке |
| GET | `/api/v1/bets/history` | История ставок пользователя |
| GET | `/api/v1/users/leaderboard` | Таблица лидеров |
| POST | `/api/v1/auth/connect` | Регистрация/подключение кошелька |

### Authenticated (x-wallet-address header)
| Method | Path | Описание |
|--------|------|---------|
| POST | `/api/v1/bets` | Создать ставку (через relayer) |
| POST | `/api/v1/bets/:id/accept` | Принять ставку |
| POST | `/api/v1/bets/:id/reveal` | Раскрыть результат |
| POST | `/api/v1/bets/:id/cancel` | Отменить ставку |
| POST | `/api/v1/bets/:id/claim-timeout` | Забрать по таймауту |
| GET | `/api/v1/vault/balance` | Баланс vault пользователя |
| POST | `/api/v1/vault/withdraw` | Вывод из vault |

### Admin (ADMIN_ADDRESSES only)
| Method | Path | Описание |
|--------|------|---------|
| GET | `/api/v1/admin/treasury/balance` | Баланс казны |
| GET | `/api/v1/admin/treasury/stats` | Статистика комиссий |
| GET | `/api/v1/admin/treasury/ledger` | Журнал казны |
| POST | `/api/v1/admin/treasury/withdraw` | Вывод из казны |
| GET | `/api/v1/admin/platform/stats` | Общая статистика |

### WebSocket
| URL | Описание |
|-----|---------|
| `ws://host:3001/ws?address=axm1...` | Real-time стрим событий |

**WebSocket события:**
- `connected` — приветствие при подключении
- `bet_created` — новая ставка
- `bet_accepted` — ставка принята
- `bet_revealed` — результат раскрыт
- `bet_canceled` — ставка отменена
- `bet_timeout_claimed` — таймаут
- `balance_updated` — обновление баланса

---

## 7. Ключевые сервисы

### Relayer Service (`relayer.ts`)
- Выполняет транзакции от имени пользователей через `x/authz` (`MsgExec`)
- **Explicit sequence tracking**: `client.sign()` с `SignerData` → `client.broadcastTx()`
- Serialized execution через `txQueue` (Promise chain)
- Retry при `sequence mismatch` с автоматическим парсингом expected sequence
- Обработка `BROADCAST_TIMEOUT` и `tx already exists in cache`

### Sequence Manager (`sequence-manager.ts`)
- Promise-based mutex для serialized доступа к account sequence
- `getAndIncrement()` — атомарное получение и инкремент
- `forceSet(seq)` — принудительная установка при ошибке
- `handleSequenceMismatch()` — refresh с чейна

### Indexer Service (`indexer.ts`)
- Поллинг новых блоков каждые 3 секунды
- Парсинг wasm событий: `bet_created`, `bet_accepted`, `bet_revealed`, `bet_canceled`, `bet_timeout_claimed`, `commission_paid`
- Event deduplication через таблицу `tx_events`
- Winner extraction из `bet_revealed` событий
- Auto-reconnect при потере соединения

### WebSocket Service (`ws.service.ts` + `ws.ts`)
- `noServer: true` с ручным HTTP upgrade на path `/ws`
- Heartbeat ping/pong каждые 30 секунд
- Broadcast и targeted (по адресу) отправка
- Подсчёт подключённых клиентов

---

## 8. Фронтенд — Ключевые компоненты

### Custom Web Wallet
- Мнемоника вводится в браузере, **никогда не отправляется на сервер**
- Шифрование: AES-256-GCM с ключом через PBKDF2 (100k итераций) из PIN
- `localStorage`: зашифрованная мнемоника (persist across sessions)
- `sessionStorage`: serialized wallet instance (persist across page refreshes)
- Аудит безопасности с подробным объяснением (EN/RU) в модальном окне

### WebSocket Hook (`use-websocket.ts`)
- Стабильное соединение (mount-only effect, refs для всех mutable values)
- Reconnect с exponential backoff (3s → 6s → 12s → ... → 30s max)
- Debounced React Query cache invalidation (300ms batch)
- Targeted invalidation по типу события

### Auto-Reveal Hook (`use-auto-reveal.ts`)
- При получении WS `bet_accepted` — автоматически reveal с хранимым секретом
- Retry с exponential backoff (3s, 6s, 12s)
- Проверка состояния ставки перед reveal
- 429-aware delays

### UI Pages
- **Landing** (`/`) — hero section, статистика (10% Commission, 5 min Timeout, 1-click Gameplay)
- **Game** (`/game`) — vault balance, create bet form, tabs (Open Bets, My Bets, History, Top Players)
- **Admin** (`/admin`) — treasury balance, stats, withdrawal, ledger

---

## 9. Что реализовано и протестировано

### Функциональность ✅

- [x] Смарт-контракт развёрнут и работает на Axiome Chain
- [x] Полный цикл игры: создание → принятие → reveal → выплата
- [x] Cancel и Claim Timeout
- [x] Vault: депозит и вывод LAUNCH-токенов
- [x] 10% комиссия автоматически в treasury
- [x] Admin панель с управлением казной
- [x] Custom web-wallet (без Keplr)
- [x] Шифрование мнемоники (AES-256-GCM + PBKDF2)
- [x] Session persistence (кошелёк сохраняется при обновлении страницы)
- [x] WebSocket real-time обновления
- [x] Leaderboard с сортировкой (Wins, Volume, Win Rate)
- [x] История ставок с фильтрами (All, Won, Lost, Pending)
- [x] Pre-flight chain state checks (перед cancel/claim/accept/reveal)
- [x] DB sync при обнаружении рассинхронизации

### Надёжность ✅

- [x] Explicit sequence tracking (нет account sequence mismatch)
- [x] Serialized tx execution (txQueue)
- [x] Rate limiting — 429 ACTION_IN_PROGRESS при concurrent requests
- [x] Event deduplication в indexer
- [x] Auto-reveal с retry и exponential backoff
- [x] Secret cleanup (устаревшие >24h автоматически удаляются)
- [x] WebSocket heartbeat (ping/pong 30s)
- [x] Stable WS hook (0 reconnects при стабильном подключении)
- [x] Graceful error handling (422, 429, 504 с информативными сообщениями)

### UI/UX ✅

- [x] Mobile-first responsive дизайн
- [x] Dark theme
- [x] Toast уведомления (success, error, warning, info)
- [x] Countdown таймеры на ставках
- [x] Wallet dropdown menu (copy, explorer, admin, disconnect)
- [x] Фильтры ставок по суммам (1-10, 10-100, 100+)
- [x] Quick bet кнопки (1, 5, 10, 50, 100, 500 LAUNCH)
- [x] Оптимистичная обратная связь при действиях
- [x] Безопасный аудит-модал для мнемоники

---

## 10. Известные ограничения (текущее состояние)

### 1. Скорость создания ставок (~10-22 секунды)
**Причина:** `broadcastTx()` ожидает включения транзакции в блок. Block time Axiome ~15-30 секунд.
**Влияние:** Пользователь ждёт 10-22с после нажатия кнопки.
**Решение:** Перейти на `broadcastTxSync` + индексер-подтверждение (см. раздел 11).

### 2. Broadcast Timeout при быстрых последовательных действиях
**Причина:** Вторая транзакция может не подтвердиться за 30с broadcast timeout.
**Влияние:** Пользователь видит "Transaction submitted but not confirmed" (транзакция реально проходит).
**Решение:** `broadcastTxSync` + оптимистичный UI (см. раздел 11).

### 3. Ставки, застрявшие в "Accepted" (потеря секрета)
**Причина:** Если пользователь очистил browser data после создания ставки, секрет утерян.
**Влияние:** Auto-reveal не может сработать, ставка зависает до claim timeout.
**Решение:** Server-side cron для автоматического claim timeout на истёкших ставках.

### 4. 1-Click Play (Authz Grant)
**Состояние:** Реализовано, но не тестировалось с реальным вторым аккаунтом.
**Ограничение:** `grantee` и `granter` не могут быть одним адресом (ограничение Cosmos SDK).

---

## 11. Production Roadmap

### Phase 1: Ускорение UX (Критический приоритет)

**Цель:** Создание ставки за ~2-3 секунды вместо ~15-22 секунд.

#### 1.1 broadcastTxSync вместо broadcastTx
- Переключить `relayer.ts` на `broadcastTxSync()` (отправка в мемпул, без ожидания блока)
- Возвращать `txHash` клиенту сразу
- Indexer сам подтвердит включение в блок и обновит DB

#### 1.2 Оптимистичный UI
- При создании ставки — сразу показать "Pending..." карточку
- При принятии — сразу обновить статус на "Accepted"
- WebSocket event подтвердит и обновит финальный статус

#### 1.3 Cron-job для зависших ставок
- Фоновая задача (setInterval 60s): найти `accepted` ставки с истёкшим `reveal_deadline`
- Автоматически вызвать `ClaimTimeout` через relayer
- Отправить WS event `bet_timeout_claimed`

---

### Phase 2: Деплой на сервер

#### 2.1 Dockerization
```dockerfile
# API Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
CMD ["node", "apps/api/dist/index.js"]
```
```dockerfile
# Frontend Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @coinflip/web build
CMD ["node", "apps/web/.next/standalone/server.js"]
```

#### 2.2 docker-compose.production.yml
- PostgreSQL 16 с persistent volume + автоматические бэкапы
- Redis 7 с persistent volume
- API container (port 3001)
- Frontend container (port 3000)
- Nginx reverse proxy (port 80/443)

#### 2.3 Nginx конфигурация
```nginx
server {
    listen 443 ssl http2;
    server_name coinflip.example.com;
    
    ssl_certificate /etc/letsencrypt/live/coinflip.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/coinflip.example.com/privkey.pem;
    
    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
    }
    
    # API
    location /api/ {
        proxy_pass http://api:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://api:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
    
    # Chain proxy (CORS bypass)
    location /chain-rest/ {
        proxy_pass http://49.13.3.227:1317/;
    }
    location /chain-rpc/ {
        proxy_pass http://49.13.3.227:26657/;
    }
}
```

#### 2.4 SSL Certificate
- Let's Encrypt через certbot
- Auto-renewal через cron

#### 2.5 Domain
- Купить/настроить домен
- DNS A-record → IP сервера

---

### Phase 3: Безопасность

#### 3.1 CORS
- Ограничить `CORS_ORIGIN` до `https://coinflip.example.com`
- Убрать wildcard `*`

#### 3.2 Rate Limiting (Nginx уровень)
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=bets:10m rate=1r/s;

location /api/v1/bets {
    limit_req zone=bets burst=3 nodelay;
    proxy_pass http://api:3001;
}
```

#### 3.3 Headers безопасности
```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' wss://coinflip.example.com";
```

#### 3.4 Переменные окружения
- Убедиться что `RELAYER_MNEMONIC` хранится в secrets manager (не в git)
- Отдельные `.env.production` файлы
- Сильный пароль PostgreSQL

#### 3.5 Admin защита
- IP whitelist для `/api/v1/admin/*`
- Или 2FA через TOTP

---

### Phase 4: UX полировка

#### 4.1 Анимации
- Анимация подбрасывания монетки при определении результата
- Confetti при выигрыше
- Smooth transitions между статусами ставок

#### 4.2 Звуки
- Звук монетки при создании ставки
- Звук выигрыша / проигрыша
- Тихий звук при получении WS-события

#### 4.3 Мобильная адаптация
- Финальная проверка на реальных устройствах (iOS Safari, Android Chrome)
- Bottom navigation оптимизация
- Touch-friendly кнопки (min 44px touch target)

#### 4.4 Онбординг
- Welcome modal для новых пользователей
- Пошаговое объяснение как играть
- Tooltips на основных элементах

#### 4.5 i18n (Интернационализация)
- Русский / English переключатель
- next-intl или аналог

---

### Phase 5: Мониторинг и надёжность

#### 5.1 Health Checks
```typescript
// GET /health
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok',
    db: dbConnected,
    indexer: indexerRunning,
    relayer: relayerReady,
    ws_clients: wsService.getClientCount(),
  });
});
```

#### 5.2 Логирование
- Structured logging (Pino, уже настроен)
- Log rotation (pm2 или logrotate)
- Отправка ошибок в Sentry / аналог

#### 5.3 Database
- Drizzle Kit migrations (версионированная схема)
- Автоматические бэкапы PostgreSQL (pg_dump cron)
- Point-in-time recovery через WAL archiving

#### 5.4 Uptime Monitoring
- Uptime Robot / Grafana + Prometheus
- Alert в Telegram при падении сервера
- PagerDuty для критических алертов

#### 5.5 Graceful Shutdown
```typescript
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  indexerService.stop();
  wss.close();
  await db.end();
  process.exit(0);
});
```

---

### Phase 6: Оптимизация производительности

#### 6.1 Next.js Production Build
- `next build` создаёт optimized standalone output
- Static pages pre-rendered
- Image optimization
- Code splitting по маршрутам

#### 6.2 Caching
- Redis для часто запрашиваемых данных (leaderboard, open bets count)
- HTTP cache headers для статических ресурсов
- React Query staleTime настройки

#### 6.3 Database
- Indexes на часто используемые запросы (bets.status, bets.maker, users.address)
- Connection pooling (pg-pool)
- Query monitoring (slow query log)

---

## 12. Переменные окружения (Production)

```bash
# ---- Chain ----
AXIOME_RPC_URL=http://49.13.3.227:26657      # Или свой Axiome нод
AXIOME_REST_URL=http://49.13.3.227:1317
AXIOME_CHAIN_ID=axiome-1

# ---- Contract ----
COINFLIP_CONTRACT_ADDR=axm1mr5l8e49kav3mw026llr8qacuqfq0yeye8zuqcwr2866xkeufptssftk9y
LAUNCH_CW20_ADDR=<CW20 contract address>

# ---- Relayer (СЕКРЕТНО — хранить в secrets manager!) ----
RELAYER_MNEMONIC=<mnemonic phrase>
RELAYER_ADDRESS=axm1p9g8yads5u6aer0hxze7gze36jklljrvxlnczz
TREASURY_ADDRESS=axm1p9g8yads5u6aer0hxze7gze36jklljrvxlnczz
ADMIN_ADDRESSES=axm1p9g8yads5u6aer0hxze7gze36jklljrvxlnczz

# ---- Database (СЕКРЕТНО) ----
DATABASE_URL=postgresql://coinflip:STRONG_PASSWORD@postgres:5432/coinflip

# ---- Redis ----
REDIS_URL=redis://redis:6379

# ---- API ----
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=https://coinflip.example.com

# ---- Frontend ----
NEXT_PUBLIC_API_URL=https://coinflip.example.com
NEXT_PUBLIC_WS_URL=wss://coinflip.example.com/ws
NEXT_PUBLIC_EXPLORER_URL=https://axiomechain.org
NEXT_PUBLIC_CHAIN_ID=axiome-1
NEXT_PUBLIC_ADMIN_ADDRESS=axm1p9g8yads5u6aer0hxze7gze36jklljrvxlnczz
```

---

## 13. Команды разработки

```bash
# Установка зависимостей
pnpm install

# Запуск Docker (PostgreSQL + Redis)
docker compose up -d

# Применить миграции DB
pnpm db:push

# Запуск dev-серверов
pnpm dev                    # API + Frontend (через Turborepo)
# или по отдельности:
pnpm --filter @coinflip/api run dev      # API на :3001
pnpm --filter @coinflip/web run dev      # Frontend на :3000

# TypeScript проверка
pnpm typecheck

# Тесты
pnpm test

# Генерация API-клиента (после изменения OpenAPI)
pnpm generate:openapi
pnpm generate:api

# Production build
pnpm build

# Database
pnpm db:push       # Применить схему
pnpm db:studio     # Drizzle Studio (визуальный UI)
```

---

## 14. Скрипты деплоя контракта

```bash
# Деплой контракта
pnpm --filter scripts tsx scripts/deploy-contract.ts

# Выдать authz grant для relayer
pnpm --filter scripts tsx scripts/grant-authz.ts

# Тест полного цикла
pnpm --filter scripts tsx scripts/test-game-cycle.ts

# Проверить контракт
pnpm --filter scripts tsx scripts/verify-contract.ts
```

---

## 15. Контакты и ссылки

| Ресурс | URL |
|--------|-----|
| Axiome Chain Explorer | https://axiomechain.org |
| RPC Node | http://49.13.3.227:26657 |
| REST API Node | http://49.13.3.227:1317 |
| Contract Address | `axm1mr5l8e49kav3mw026llr8qacuqfq0yeye8zuqcwr2866xkeufptssftk9y` |
| Relayer Address | `axm1p9g8yads5u6aer0hxze7gze36jklljrvxlnczz` |

---

*Документ обновляется по мере прогресса. Следующий шаг: Phase 1 — Ускорение UX.*
