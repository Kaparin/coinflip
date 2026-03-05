# Coinflip Architecture & Developer Guide

## Overview

PvP CoinFlip dApp on Axiome Chain. Two players wager AXM (native token) on heads/tails. Winner gets 2x stake minus 10% commission. "1-click" UX via Cosmos x/authz delegation + x/feegrant gas sponsorship.

---

## Token Economics

### AXM (Native Token)
- **Denom**: `uaxm` (1 AXM = 1,000,000 uaxm)
- **Role**: Game currency (wagers, deposits, withdrawals)
- **Usage**: Betting stakes, gas fees, shop payments
- **Mode**: Controlled by `GAME_CURRENCY=axm` env flag

### COIN (CW20 Token)
- **Contract**: `axm1cv5er0wsla3u33w6rkn7ckxpn88huqh9aw0xpu0pagksege7v7nsn8qdhs`
- **Decimals**: 6 (1 COIN = 1,000,000 micro-COIN)
- **Role**: Utility token for in-game purchases
- **Usage**:
  - VIP subscriptions (50-200 COIN/month)
  - Bet pinning (minimum 3 COIN, 2x outbid)
  - Announcements
  - Event sponsorship
  - Purchased via Shop (AXM from vault → COIN credited to balance)

### Balance Architecture
Each user has in `vault_balances`:
- `available` — AXM deposited to contract vault (synced from chain)
- `locked` — AXM in active bets (synced from chain)
- `offchain_spent` — AXM deducted for off-chain purchases (VIP, pins, shop)
- `bonus` — off-chain bonus AXM
- `coin_balance` — COIN utility token balance (separate from AXM)

**Effective AXM balance** = `available + bonus - offchain_spent`

---

## Infrastructure

| Service | Technology | Provider | Purpose |
|---------|-----------|----------|---------|
| Frontend | Next.js 15 + React 19 | Vercel | Web app |
| API | Hono + Node.js 22 | Railway | REST + WebSocket |
| Database | PostgreSQL 17 | Neon | Persistent storage |
| Cache | Redis | Railway | Rate limiting, caching |
| Blockchain | Cosmos SDK | Self-hosted (49.13.3.227) | Axiome Chain |
| Smart Contract | CosmWasm 1.4 (Rust) | On-chain | CoinFlip logic |

---

## Chain Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | `axiome-1` |
| Address prefix | `axm` |
| BIP-44 Coin Type | 546 |
| HD Path | `m/44'/546'/0'/0/0` |
| RPC | `http://49.13.3.227:26657` |
| REST | `http://49.13.3.227:1317` |
| Gas Price | `0.025uaxm` |
| Explorer | `https://axiomechain.org` |

### Smart Contracts

| Contract | Env Var | Code ID | Purpose |
|----------|---------|---------|---------|
| CoinFlip Native | `COINFLIP_NATIVE_CONTRACT_ADDR` | 29 | AXM-mode betting |
| CoinFlip CW20 | `COINFLIP_CONTRACT_ADDR` | 29 | COIN-mode betting (legacy) |
| COIN Token | `LAUNCH_CW20_ADDR` | — | CW20 utility token |
| Presale | `NEXT_PUBLIC_PRESALE_CONTRACT` | 30 | AXM→COIN swap |

### Key Wallets

| Wallet | Purpose | Env Var |
|--------|---------|---------|
| Relayer | Signs & broadcasts MsgExec transactions | `RELAYER_MNEMONIC` |
| Treasury | Receives AXM payments, holds COIN inventory | `TREASURY_ADDRESS` |
| Admin | Admin panel access | `ADMIN_ADDRESSES` (comma-separated) |

---

## Core Payment Flows

### 1. Deposit (AXM → Vault)
```
User → Signs deposit tx (wallet) → broadcastTxSync → API returns 202
  → Background: pollForTx → chain confirms → DB balance updated
  → WebSocket: deposit_confirmed → frontend refreshes balance
```
- User signs `MsgExecuteContract.deposit` via personal wallet
- Server returns 202 immediately (async mode)
- Background polls chain for tx confirmation (up to 60s)
- On confirm: vault_balances.available updated, WS notification sent

### 2. Withdrawal (Vault → Wallet)
```
User → POST /vault/withdraw → Relayer MsgExec → API returns 202
  → Background: pollForTx → chain confirms → DB balance updated
  → WebSocket: withdraw_confirmed → frontend refreshes balance
```
- Server validates sufficient balance, locks funds
- Relayer broadcasts `MsgExec(MsgExecuteContract.withdraw)` as `broadcastTxSync`
- Background polls for confirmation
- On success: balance synced, treasury sweep triggered

### 3. Bet Creation (Commit-Reveal)
```
User picks side + amount → Client generates secret
  → commitment = SHA256("coinflip_v1" || maker_addr || side || secret)
  → POST /bets/create { commitment, amount }
  → Relayer MsgExec(create_bet) → 202 returned
  → Indexer: bet_created event → DB row created
  → Secret stored in pending_bet_secrets (never on-chain until reveal)
```

### 4. Bet Acceptance & Resolution
```
Acceptor → POST /bets/:id/accept { guess }
  → Relayer MsgExec(accept_bet) → 202 returned
  → Chain: contract auto-resolves (commitment vs guess)
  → Indexer: bet_accepted → DB updated with winner
  → WS: bet_accepted broadcast to both players
  → Auto-reveal: server fetches secret from pending_bet_secrets
    → Relayer MsgExec(reveal) → finalizes payout
  → Commission (10%) → treasury
  → Referral rewards distributed (3-level)
```

### 5. Shop Purchase (AXM → COIN)
```
User → POST /shop/buy { chest_tier }
  → Server deducts AXM from vault_balances (offchain_spent++)
  → Server credits COIN to vault_balances.coin_balance
  → Per-tier first purchase: x2 COIN bonus
  → Returns 200 immediately (instant, no blockchain tx)
  → WS: purchase_confirmed + balance_updated
```

---

## Key Backend Services

### Relayer (`apps/api/src/services/relayer.ts`)
- Hot wallet executing delegated transactions via Cosmos x/authz
- Users grant `ContractExecutionAuthorization` scoped to CoinFlip contract only
- Transaction: `MsgExec { grantee: relayer, msgs: [MsgExecuteContract { sender: user }] }`
- Gas paid by treasury via x/feegrant
- Mutex-based broadcast queue serializes to prevent nonce races
- SequenceManager tracks nonce in-memory, refreshes from chain on mismatch

### Indexer (`apps/api/src/services/indexer.ts`)
- Polls Axiome chain blocks for CoinFlip contract events
- Events: `bet_created`, `bet_accepted`, `bet_revealed`, `bet_canceled`, `bet_timeout_claimed`, `commission_paid`
- Updates PostgreSQL, triggers referrals/jackpots/events
- WebSocket broadcast to all connected clients

### Treasury Service (`apps/api/src/services/treasury.service.ts`)
- Manages treasury wallet balances (AXM native + COIN CW20)
- Receives commissions, shop payments
- Pays referral rewards, event prizes
- Treasury sweep: auto-moves confirmed commissions to treasury wallet

### Vault Service (`apps/api/src/services/vault.service.ts`)
- `deductBalance(userId, amount)` — atomic AXM deduction from vault
- `creditCoin(userId, amount)` — atomic COIN credit to balance
- `deductCoin(userId, amount)` — atomic COIN deduction (pins, etc.)
- Chain sync: indexer updates `available`/`locked` from on-chain state

### WebSocket Service (`apps/api/src/services/ws.service.ts`)
- Hono WebSocket upgrade
- `broadcast(event)` — sends to all connected clients
- `sendToAddress(address, event)` — sends to specific wallet
- Events: bet lifecycle, balance updates, deposits, withdrawals, jackpots, events, shop

---

## Feature Systems

### VIP System
| Tier | Price/mo | Daily Boosts | Jackpot Access |
|------|----------|-------------|----------------|
| Silver | 50 COIN | 10 | Large tier |
| Gold | 100 COIN | Unlimited | Mega tier |
| Diamond | 200 COIN | Unlimited | Super Mega tier |

- Diamond: profile customization (name gradient, frame style, badge)
- Yearly pricing available (discount)
- Admin-editable via `vip_config` table

### Events System
- **Contests**: Auto-participation, leaderboard ranked by metric (turnover/wins/profit)
- **Raffles**: Manual join, PRNG-based winner selection
- **Sponsored Raffles**: Users pay to create (admin approval required)
- **Status flow**: draft → active → calculating → completed → archived

### Referral System
- **3-level commission** on friend's winnings:
  - Level 1: 3% | Level 2: 1.5% | Level 3: 0.5%
- Max 500 BPS (5%) per bet
- Branch change after 1000 COIN earned from previous referrer
- Claiming transfers unclaimed balance to vault

### Jackpot System
- **5 tiers**: mini, medium, large, mega, super_mega
- Funded from bet commissions (configurable BPS per tier)
- Drawing: PRNG with on-chain seed
- VIP tier gates access to higher tiers

### Bet Pinning
- 3 premium slots at top of bet list
- Minimum 3 COIN, 2x to outbid
- 50% refund if pinned bet expires naturally
- Paid from COIN balance

---

## Database Schema Overview

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | Player accounts (address, nickname, avatar, telegram, referrer) |
| `bets` | All game records with full state machine |
| `vault_balances` | Per-user AXM + COIN balances |
| `sessions` | Auth sessions (bearer token + cookie) |
| `tx_events` | Chain event audit log |
| `treasury_ledger` | Commission & payout tracking |

### Feature Tables
| Table | Purpose |
|-------|---------|
| `referral_codes` | Invite codes |
| `referrals` | Who invited whom |
| `referral_rewards` | Per-bet referral payouts |
| `referral_balances` | Claimable referral earnings |
| `vip_subscriptions` | VIP purchase history |
| `vip_config` | Tier pricing |
| `vip_customization` | Diamond appearance |
| `bet_pins` | Pinned bet slots |
| `boost_usage` | Boost tracking |
| `shop_purchases` | COIN chest sales |
| `events` | Contests & raffles |
| `event_participants` | Event entries & results |
| `jackpot_tiers` | Tier configuration |
| `jackpot_pools` | Active jackpot pools |
| `jackpot_contributions` | Per-bet contributions |
| `bet_messages` | Duel chat messages |
| `announcements` | Admin broadcasts |
| `news_posts` | Blog/updates |
| `platform_config` | Dynamic settings (shop tiers, etc.) |
| `partner_config` | Revenue sharing partners |
| `partner_ledger` | Partner payouts |
| `pending_bet_secrets` | Maker secrets pre-reveal |
| `profile_reactions` | Emoji reactions on profiles |
| `user_notifications` | Alerts/notifications |

---

## Authentication

- **Primary**: HTTP-only cookie (set by API on login)
- **Fallback**: Bearer token in `Authorization` header (iOS Safari ITP blocks third-party cookies)
- **Storage**: Token in `sessionStorage` (never `localStorage`)
- **WebSocket**: Token passed as `?token=` query param
- **Session**: HMAC-signed, stored in `sessions` table

---

## Frontend Architecture

### State Management
1. **React Query** — server state (bets, balances, events)
2. **PendingBalanceContext** — optimistic balance changes during in-flight txs
3. **usePendingBets** — unconfirmed bet states (before chain confirmation)
4. **useActiveDuels** — live duel animations (singleton store via `useSyncExternalStore`)

### WebSocket Integration
- Connection with exponential backoff reconnection
- Events drive React Query cache invalidation (800ms debounce)
- Critical events (deposit/withdraw confirmed) bypass debounce
- Balance grace period (4s) prevents stale refetches overwriting optimistic updates

### i18n
- Russian + English
- All sections translated
- Context-aware substitution with `{variable}` syntax

---

## Environment Variables (Key)

### API (`apps/api/.env`)
```
DATABASE_URL=            # Neon PostgreSQL connection string
REDIS_URL=               # Redis connection string
RELAYER_MNEMONIC=        # Relayer wallet mnemonic (CRITICAL SECRET)
SESSION_SECRET=          # Session signing key (min 32 chars)
ADMIN_ADDRESSES=         # Comma-separated admin wallet addresses
TREASURY_ADDRESS=        # Treasury wallet address
COINFLIP_CONTRACT_ADDR=  # CoinFlip CW20 contract
COINFLIP_NATIVE_CONTRACT_ADDR= # CoinFlip native contract
LAUNCH_CW20_ADDR=        # COIN token CW20 address
GAME_CURRENCY=axm        # 'axm' or 'coin'
DEPOSIT_ASYNC_MODE=true  # Async deposits (202 pattern)
AXIOME_RPC_URL=          # Chain RPC endpoint
AXIOME_REST_URL=         # Chain REST endpoint
```

### Web (`apps/web/.env`)
```
NEXT_PUBLIC_API_URL=     # API base URL
NEXT_PUBLIC_GAME_CURRENCY=axm  # 'axm' or 'coin'
NEXT_PUBLIC_COINFLIP_NATIVE_CONTRACT= # Native contract address
NEXT_PUBLIC_PRESALE_CONTRACT= # Presale contract (optional)
NEXT_PUBLIC_TREASURY_ADDRESS= # Treasury for shop
```

---

## Security Model

### Authz (Authorization)
- **MUST** use `ContractExecutionAuthorization` with `AcceptedMessageKeysFilter`
- **NEVER** use `GenericAuthorization` on `MsgExecuteContract`
- Scoped to single CoinFlip contract address only

### Commit-Reveal Fairness
- Maker generates 256-bit secret client-side
- Commitment = SHA256("coinflip_v1" || maker_addr || side || secret)
- Secret stored in DB (`pending_bet_secrets`), never on-chain until reveal
- Contract validates commitment on reveal

### Rate Limiting
- Per-wallet request throttling via middleware
- Configurable intervals per endpoint category

### Balance Protection
- Atomic operations (SQL WHERE balance >= amount)
- Grace period prevents stale refetches overwriting optimistic updates
- offchain_spent counter survives chain sync (never reset by indexer)
