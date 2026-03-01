# End-to-End аудит производительности и надёжности

## Резюме

Три корневые причины жалоб «депозиты долго» и «игра тупит»:

1. **Эндпоинт депозита блокирует ответ до 30 секунд**, опрашивая chain REST каждые 2с в ожидании подтверждения транзакции. Если нода под нагрузкой или block time скачет — пользователь ждёт 4-30с.

2. **Фронтенд рендерит 50+ BetCard с индивидуальными таймерами (1с) без мемоизации** — 50 `setInterval(1000)` генерируют ~50 ре-рендеров/сек. Плюс 5 дублирующих подписок на баланс + 4 вкладки всегда смонтированы → каждое WS-событие вызывает каскадный ре-рендер всего дерева компонентов.

3. **Лидерборд + TopWinner делают full table scan без кэширования** — нет индекса на `bets.winner_user_id`, нет кэша лидерборда/статистики, каст `payout_amount::numeric` блокирует использование индекса. Эти запросы замедляются линейно с ростом количества ставок.

---

## Слой 1: RPC / Blockchain

### Находки

| # | Проблема | Критичность | Доказательство |
|---|----------|-------------|----------------|
| R1 | **Единственная chain-нода, нет фейловера** | P0 | RPC (`49.13.3.227:26657`) и REST (`49.13.3.227:1317`) — одна машина. Нода упала = вся система встала. |
| R2 | **Депозит опрашивает chain REST 30 секунд** | P0 | `apps/api/src/routes/vault.ts:308-340` — цикл `while` с интервалом 2с, таймаут 30с. Блокирует HTTP-ответ. |
| R3 | **Индексер использует REST polling, а не CometBFT WebSocket** | P1 | `apps/api/src/services/indexer.ts:79` — интервал 3с = гарантированная задержка 0-3с на блок. CometBFT WS push был бы ~0мс. |
| R4 | **Таймаут 5с на каждый chain REST запрос** | P2 | `AbortSignal.timeout(5000)` везде. Если нода тормозит, 5 запросов = 25с блокировки. Нет circuit breaker. |
| R5 | **Sequence manager создаёт одноразовые TCP-соединения** | P2 | `sequence-manager.ts` — `refresh()` делает `StargateClient.connect()` + немедленный disconnect. При ретраях — чернь соединений. |

### Разбивка задержки депозита (текущая)
```
Пользователь подписывает tx в Keplr        ~1-3с (действие пользователя)
Frontend POST /vault/deposit/broadcast
  → Сервер REST broadcast (SYNC)              ~200мс
  → Первый poll (sleep 2с)                    +2с
  → Следующие poll'ы (в среднем 2 блока)      +4с  ← chain подтверждает за ~3-5с
  → Chain REST возвращает результат tx         ~100мс
  → Инвалидация кэша + синк баланса           ~200мс (async, не блокирует)
Итого на сервере:                             ~6-8с лучший случай, 30с таймаут — худший
```

### Разбивка задержки создания/принятия ставки (текущая)
```
Frontend POST /bets/create
  → API возвращает 202 сразу                  ~50мс  ✓ хорошо
  → Релейер бродкастит (mutex очередь)        ~100-500мс (зависит от глубины очереди)
  → Chain включает в блок                     ~3-5с
  → Индексер обнаруживает событие (poll 3с)   +0-3с  ← вот эта задержка
  → Обновление БД + WS broadcast              ~50мс
  → Инвалидация кэша на фронте               +800мс (debounce)
Итого: 202 возвращается быстро, но обновление UI занимает 4-9с
```

---

## Слой 2: Backend / API

### Находки

| # | Проблема | Критичность | Доказательство |
|---|----------|-------------|----------------|
| B1 | **Эндпоинт депозита — блокирующий запрос на 30с** | P0 | `vault.ts:308-340` — держит HTTP-воркер до 30с на каждый депозит. Под нагрузкой может исчерпать event loop. |
| B2 | **Broadcast queue — однопоточное бутылочное горлышко** | P1 | `relayer.ts` — все операции релейера (create, accept, reveal, cancel, withdraw, auto-reveal, timeout-claim) идут через один мьютекс. Background sweep добавляет auto-reveal/cancel в ту же очередь. Макс ~10 tx/с. |
| B3 | **Startup sync — O(N) последовательных chain-запросов** | P1 | `indexer.ts:71` — `syncAllBetsWithChain()` запрашивает chain по каждой pending ставке. 100 pending × 5с таймаут = до 500с в худшем случае. |
| B4 | **In-memory inflight guard не работает при нескольких инстансах** | P1 | `inflight-guard.ts` — Map в памяти. При 2+ инстансах на Railway параллельные запросы одного юзера обойдут гард → потенциальный double-lock. |
| B5 | **Кэш баланса 10с TTL — stale reads после депозита** | P2 | `vault.ts:50` — `getChainVaultBalance()` кэшируется 10с. Даже после `invalidateBalanceCache()` конкурентный запрос может пересидить кэш со старыми данными. |
| B6 | **`syncBalanceFromChain` с height=0n перезаписывает индексированные данные** | P2 | `vault.service.ts:56` — live-запрос всегда побеждает, может откатить БД-баланс если REST-нода отстаёт от RPC. |
| B7 | **Background sweep (15с) разделяет очередь с релейером** | P2 | `background-tasks.ts` — auto-reveal/cancel идут через ту же broadcast queue. При массовом auto-cancel (много expired ставок) пользовательские операции встают в очередь за свипом. |
| B8 | **Нет `prepare: false` для Neon pooled endpoint** | P2 | `packages/db/src/index.ts` — если DATABASE_URL использует `-pooler` (PgBouncer в transaction mode), prepared statements будут периодически падать. |

---

## Слой 3: База данных

### Находки

| # | Проблема | Критичность | Доказательство |
|---|----------|-------------|----------------|
| D1 | **Нет индекса на `bets.winner_user_id`** | P0 | Используется в `getUserStats()`, `getTopWinner()`, activity-запросах, лидерборде CTE. Full table scan при каждом вызове. |
| D2 | **Лидерборд: полный скан ВСЕХ resolved ставок, без кэша** | P0 | `user.service.ts:267` — CTE сканирует bets дважды (makers + acceptors), агрегирует. O(n) рост. Вызывается каждые 30с на каждого подключённого юзера. |
| D3 | **`getTopWinner()`: полный скан + сортировка, без кэша** | P1 | `user.service.ts:466` — `ORDER BY payout_amount::numeric DESC`. Каст `::numeric` блокирует любой индекс. Вызывается при каждой загрузке страницы. |
| D4 | **Jackpot `getEligibleUsers()`: O(users × bets) коррелированный подзапрос** | P1 | `jackpot.service.ts:302` — `WHERE (SELECT COUNT(*) FROM bets WHERE maker_user_id = u.id OR ...) >= $1`. Запускается при розыгрыше. |
| D5 | **Нет составного VIP-индекса** | P2 | Коррелированный `(SELECT vs.tier FROM vip_subscriptions WHERE user_id = ... AND expires_at > NOW() ...)` встречается в 8+ запросах. Есть только одноколоночный индекс. |
| D6 | **N+1 при обходе реферальной цепочки** | P2 | `referral.service.ts:395` — до 3 последовательных запросов на игрока, вызывается дважды за resolved bet = 6 запросов. Можно заменить одним рекурсивным CTE. |
| D7 | **N+1 в истории джекпотов** | P2 | `jackpot.service.ts:541` — один запрос на пул за никнеймом победителя. Должен быть JOIN. |
| D8 | **`getUserStats()` без кэша** | P2 | `user.service.ts:237` — полная агрегация при каждом `/me` и просмотре профиля. |
| D9 | **Нет индекса на `users.telegram_id`** | P2 | Auth-лукап по telegram_id делает seq scan. |

---

## Слой 4: Frontend / UX

### Находки

| # | Проблема | Критичность | Доказательство |
|---|----------|-------------|----------------|
| F1 | **50 BetCard × 2 `setInterval(1000)` = ~100 таймеров/сек** | P0 | `bet-card.tsx:71-108` — каждая карточка запускает `useCountdown` дважды. 50 открытых ставок = 100 обновлений состояния/сек, каждое вызывает полный ре-рендер BetCard. |
| F2 | **Ноль `React.memo` во всём проекте** | P0 | Ни один компонент не использует `React.memo`. Каждый ре-рендер родителя каскадирует на всех детей. |
| F3 | **4 вкладки всегда смонтированы (display:none)** | P1 | `page.tsx:217-229` — BetList, MyBets, HistoryList, Leaderboard монтируются одновременно. Все опрашивают API даже когда невидимы. 8-10 конкурентных polling-запросов постоянно. |
| F4 | **5 дублирующих подписок на vault balance** | P1 | `useGetVaultBalance` вызывается в Header, MobileBalanceBar, BetList, CreateBetForm, BalanceDisplay. Каждый подписчик ре-рендерится при обновлении кэша. |
| F5 | **WS-событие → двойной ре-рендер** | P1 | `use-websocket.ts` — мгновенная мутация `setQueriesData` → ре-рендер. Затем через 800мс debounced `invalidateQueries` → новый fetch → второй ре-рендер. |
| F6 | **`setLastEvent` вызывает лишний ре-рендер на каждое WS-сообщение** | P2 | `use-websocket.ts:193` — `setLastEvent(parsed)` при каждом входящем сообщении. `lastEvent` нигде не используется. |
| F7 | **Wallet balance — хардкодный poll 15с, не учитывает WS** | P2 | `use-wallet-balance.ts:33` — `refetchInterval: 15_000` всегда активен, даже когда WS подключён и может пушить обновления. |
| F8 | **`myResolved` фильтр не мемоизирован → бесконечный цикл ре-рендера 5с** | P2 | `my-bets.tsx:176-203` — `.filter()` пересоздаёт массив каждый рендер, эффект перезапускается, ставит таймер 5с, и так навсегда. |

---

## Приоритизированный список проблем

### P0 — Критические (видимые пользователю, риск целостности данных)

1. **R1** — Единственная chain-нода, нет фейловера
2. **R2 + B1** — Эндпоинт депозита блокирует 30с polling'ом chain
3. **D1 + D2 + D3** — Отсутствующие индексы + некэшированные тяжёлые запросы
4. **F1 + F2** — 100 таймеров/сек + нет мемоизации = постоянные фризы

### P1 — Высокие (деградация под нагрузкой)

5. **B2 + B7** — Бутылочное горлышко broadcast queue, sweep отбирает ресурсы
6. **R3** — Индексер на REST polling вместо CometBFT WS
7. **F3** — Все вкладки всегда смонтированы
8. **F4** — 5x ре-рендер на обновление баланса
9. **F5** — WS двойной ре-рендер
10. **D4** — Jackpot eligibility O(users × bets)
11. **B3** — Startup sync O(N) на pending bet
12. **B4** — Inflight guard только in-memory

### P2 — Средние (возможности оптимизации)

13. **D5** — Отсутствующий составной VIP-индекс
14. **D6** — N+1 при обходе реферальной цепочки
15. **F6** — Неиспользуемый `setLastEvent`
16. **F7** — Polling кошелька не учитывает WS
17. **F8** — Бесконечный цикл force-rerender в MyBets
18. **B5 + B6** — Staleness кэша баланса
19. **B8** — Нет `prepare: false` для Neon pooler
20. **D8** — getUserStats без кэша
21. **D9** — Нет индекса на telegram_id

---

## Таблица таймаутов и интервалов (текущие)

| Параметр | Значение | Расположение |
|----------|----------|-------------|
| Интервал polling индексера | 3 000мс | `index.ts:49` |
| Интервал background sweep | 15 000мс | `background-tasks.ts` |
| Таймаут chain REST запроса | 5 000мс | Везде (AbortSignal.timeout) |
| Таймаут poll'а tx релейера (sync) | 25 000мс | `relayer.ts:354` |
| Интервал poll'а tx релейера | 2 000мс | `relayer.ts:355` |
| Таймаут poll'а депозита | 30 000мс | `vault.ts:309` |
| Интервал poll'а депозита | 2 000мс | `vault.ts:310` |
| TTL кэша chain (по умолчанию) | 5 000мс | `chain-cache.ts:16` |
| TTL кэша баланса vault | 10 000мс | `vault.ts:50` |
| TTL кэша состояния ставки | 3 000мс | `background-tasks.ts` |
| TTL pending lock (сервер) | 90 000мс | `vault.ts:59` |
| Отложенное удаление pending lock | 5 000мс | `vault.ts:98` |
| Auto-expire pending deduction (клиент) | 90 000мс | `pending-balance-context.tsx:76` |
| Grace period баланса | 5-8 000мс | Вызывающий код |
| WS debounce инвалидация | 800мс | `use-websocket.ts:118` |
| WS heartbeat | 30 000мс | `ws.ts:96` |
| WS reconnect backoff | 3-30 000мс | `use-websocket.ts:180` |
| WS poll fallback (подключён) | 30 000мс | `use-websocket.ts:40` |
| WS poll fallback (отключён) | 15 000мс | `use-websocket.ts:42` |
| Jackpot backfill | 60 000мс | `index.ts:67` |
| DB pool max connections (Neon) | 10 | `packages/db/src/index.ts:9` |
| DB idle timeout | 20с | `packages/db/src/index.ts:10` |
| DB connect timeout | 10с | `packages/db/src/index.ts:11` |
| DB max lifetime (Neon) | 300с | `packages/db/src/index.ts:12` |

---

## План исправлений

### Быстрые фиксы — сегодня

#### QF-1: Добавить недостающие индексы БД (10 мин, огромный эффект)

Ожидаемый результат: лидерборд p95 −60%, top winner p95 −80%, stats p95 −40%.

```sql
-- bets.winner_user_id (используется в 8+ запросах)
CREATE INDEX CONCURRENTLY bets_winner_idx
  ON bets (winner_user_id) WHERE winner_user_id IS NOT NULL;

-- bets.payout_amount для сортировки getTopWinner
CREATE INDEX CONCURRENTLY bets_payout_desc_idx
  ON bets (payout_amount DESC NULLS LAST) WHERE payout_amount IS NOT NULL;

-- VIP составной индекс (используется в 8+ коррелированных подзапросах)
CREATE INDEX CONCURRENTLY idx_vip_sub_active
  ON vip_subscriptions (user_id, expires_at DESC) WHERE canceled_at IS NULL;

-- users.telegram_id
CREATE UNIQUE INDEX CONCURRENTLY users_telegram_id_idx
  ON users (telegram_id) WHERE telegram_id IS NOT NULL;

-- profile_reactions.to_user_id
CREATE INDEX CONCURRENTLY profile_reactions_to_user_idx
  ON profile_reactions (to_user_id);
```

#### QF-2: Добавить in-memory кэш для лидерборда + top winner (30 мин)

`apps/api/src/services/user.service.ts` — обернуть `getLeaderboard()` и `getTopWinner()` кэшем на 60с.

Ожидаемый результат: −95% нагрузки на БД от этих запросов (вместо запроса каждые 30с на юзера — один запрос в 60с на всех).

#### QF-3: Обернуть BetCard в React.memo (15 мин)

`apps/web/src/components/features/bets/bet-card.tsx` — добавить `export const BetCard = React.memo(BetCardInner)`.

Ожидаемый результат: −80% ре-рендеров в BetList.

#### QF-4: Убрать `setLastEvent` (5 мин)

`apps/web/src/hooks/use-websocket.ts:193` — убрать `setLastEvent(parsed)` и связанный useState. Устраняет один лишний ре-рендер на каждое WS-сообщение.

#### QF-5: Мемоизировать `myResolved` в MyBets (5 мин)

`apps/web/src/components/features/bets/my-bets.tsx:176` — обернуть фильтр в `useMemo`, чтобы прекратить бесконечный цикл 5с ре-рендера.

---

### Среднесрочные — эта неделя

#### MT-1: Перевести депозит на async 202 паттерн (как создание ставки)

**Файлы:** `apps/api/src/routes/vault.ts`

Изменить `POST /vault/deposit/broadcast`:
1. Бродкастить tx через SYNC mode → получить txHash
2. Вернуть `202 { status: 'pending', tx_hash }` немедленно (не poll'ить)
3. Индексер подхватит событие депозита при подтверждении → WS `balance_updated` → фронтенд обновится

**Ожидаемый результат:** Время ответа депозита падает с 6-30с до ~200мс. Фронтенд показывает «подтверждается...» оптимистично.

#### MT-2: Консолидировать countdown-таймеры (общий таймер)

**Файл:** `apps/web/src/components/features/bets/bet-card.tsx`

Заменить 50 индивидуальных `setInterval(1000)` одним `CountdownProvider` контекстом, который тикает раз в секунду. Все BetCard читают из контекста (без личных таймеров).

**Ожидаемый результат:** 100 таймеров/сек → 1 таймер/сек. −99% ре-рендеров от таймеров.

#### MT-3: Ленивый монтаж скрытых вкладок

**Файл:** `apps/web/src/app/game/page.tsx:217-229`

Заменить `display: none` на условный рендеринг. Кэшировать позиции скролла. Монтировать только активную вкладку.

**Ожидаемый результат:** −75% API-запросов от polling'а (3 из 4 вкладок перестают poll'ить).

#### MT-4: Дедупликация подписок на vault balance

Убрать `useGetVaultBalance()` из BetList, CreateBetForm, Header. Оставить один источник в `VaultBalanceProvider` контексте. Остальные компоненты читают из контекста.

**Ожидаемый результат:** 5 каскадов ре-рендера → 1 на обновление баланса.

#### MT-5: Убрать WS двойной ре-рендер

**Файл:** `apps/web/src/hooks/use-websocket.ts`

Для `bet_accepting`, `bet_accepted`, `bet_revealed` — делать ЛИБО мгновенный `setQueriesData` ЛИБО debounced `invalidateQueries`, не оба. Мгновенная мутация достаточна; последующий refetch перезаписывает теми же данными.

**Ожидаемый результат:** −50% ре-рендеров на каждое WS-событие.

#### MT-6: Сделать все polling'и WS-aware

**Файлы:** `use-wallet-balance.ts`, `use-leaderboard.ts`, `use-jackpot.ts`

Применить существующий паттерн `isWsConnected ? 30_000 : 15_000` ко всем хукам с хардкодными интервалами. Когда WS подключён — полагаться на push-события.

**Ожидаемый результат:** −50% фоновых API-вызовов.

#### MT-7: Добавить RPC failover

**Файлы:** `apps/api/src/config/env.ts`, `indexer.ts`, `relayer.ts`

Добавить `AXIOME_RPC_URL_FALLBACK` / `AXIOME_REST_URL_FALLBACK`. При отказе основной ноды — переключаться на резервную. Простой health check с circuit breaker на 10с.

**Ожидаемый результат:** Устраняет единую точку отказа для связи с блокчейном.

---

### Архитектурные — 2-4 недели

#### AR-1: CometBFT WebSocket вместо REST polling

**Файл:** `apps/api/src/services/indexer.ts`

Заменить 3с REST poll на постоянную подписку через CometBFT WebSocket:
```
ws://49.13.3.227:26657/websocket
Subscribe: tm.event='Tx' AND wasm._contract_address='COINFLIP_ADDR'
```

**Ожидаемый результат:** Задержка обнаружения блока падает с 0-3с до ~0мс. В связке с MT-1, полный цикл депозит→UI-обновление падает с 6-30с до ~3-5с (только время блока).

#### AR-2: Redis-кэш для лидерборда + статистики

Заменить in-memory кэши (QF-2) на Redis. Добавить материализованный лидерборд, обновляемый раз в 5 минут фоновой задачей. Это позволяет масштабировать API горизонтально (несколько инстансов).

**Ожидаемый результат:** Запрос лидерборда полностью исключён из горячего пути.

#### AR-3: Перенести inflight guard в Redis

**Файл:** `apps/api/src/lib/inflight-guard.ts`

Заменить in-memory Map на Redis SETNX с TTL. Необходимо для горизонтального масштабирования.

#### AR-4: Разделить очередь релейера на приоритеты

Разделить broadcast queue на два канала:
- **Priority queue** — пользовательские операции (create, accept, withdraw, deposit)
- **Background queue** — sweep-операции (auto-reveal, auto-cancel, timeout claim)

Background queue обрабатывается только когда priority пустая. Предотвращает ситуацию, когда sweep блокирует пользовательские операции.

**Ожидаемый результат:** Под нагрузкой пользовательские операции всегда идут первыми. p95 подтверждения создания ставки снижается на время ожидания в очереди (~0.5-2с).

#### AR-5: Виртуализация списков BetCard и HistoryList

Добавить `@tanstack/react-virtual` для BetList (50 элементов) и HistoryList (100 элементов). Рендерить только элементы во viewport.

**Ожидаемый результат:** −80% DOM-нод, −80% стоимости mount/unmount.

---

## Черновой план PR/коммитов

| PR | Коммиты | Приоритет | Ожидаемый эффект |
|----|---------|-----------|------------------|
| **PR-1: Индексы БД + кэши запросов** | 1. `chore: add missing DB indexes` 2. `perf: add 60s cache for leaderboard+topWinner+userStats` | P0 | p95 API −60% |
| **PR-2: Производительность рендеринга** | 1. `perf: React.memo on BetCard` 2. `perf: remove unused setLastEvent` 3. `fix: memoize myResolved filter` 4. `perf: consolidate countdown to shared timer` 5. `perf: lazy-mount hidden tabs` | P0 | FPS +40%, ре-рендеры −90% |
| **PR-3: Async депозит** | 1. `feat: convert deposit to async 202 pattern` 2. `feat: add deposit pending UI state` | P0 | Ответ депозита 30с → 200мс |
| **PR-4: Дедуп баланса + WS cleanup** | 1. `refactor: VaultBalanceProvider context` 2. `perf: remove WS double-render` 3. `perf: make all polling WS-aware` | P1 | −75% ре-рендеров баланса |
| **PR-5: RPC failover** | 1. `feat: add RPC/REST failover with circuit breaker` | P1 | Устраняет SPOF |
| **PR-6: CometBFT WS индексер** | 1. `feat: replace REST polling with CometBFT WebSocket` | P1 | Обнаружение событий 0-3с → ~0мс |
| **PR-7: Redis inflight + кэш** | 1. `refactor: Redis-backed inflight guard` 2. `feat: Redis leaderboard cache` | P2 | Горизонтальное масштабирование |
| **PR-8: Приоритеты очереди** | 1. `feat: priority/background broadcast queues` | P2 | User ops не блокируются sweep'ом |

---

## Обратная совместимость

Все фиксы обратно совместимы:
- QF-1 (индексы): `CREATE INDEX CONCURRENTLY` — не блокирует запись, можно катить на прод
- QF-2 (кэши): Читают те же данные, просто реже обращаются к БД
- QF-3-5 (фронт): Чисто оптимизация рендеринга, API не меняется
- MT-1 (async депозит): Добавить `status: 'pending'` в существующий ответ, фронт обрабатывает оба формата
- MT-7 (failover): Добавляет env-переменные, не ломает работу без них

## Критерии проверки

1. p95 ответа `/api/v1/users/leaderboard` < 100мс (сейчас прогнозируемо > 500мс при росте данных)
2. p95 ответа `/api/v1/vault/deposit/broadcast` < 500мс (сейчас 6-30с)
3. FPS на странице игры с 50 ставками > 55 (сейчас прогнозируемо < 30 из-за таймеров)
4. Количество одновременных polling-запросов на game page ≤ 3 (сейчас 8-10)
5. Время обнаружения chain-события < 500мс (сейчас 0-3с)
