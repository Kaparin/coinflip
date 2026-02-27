# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Install dependencies
pnpm install

# Development (all apps via Turborepo)
pnpm dev

# Single app dev
pnpm --filter @coinflip/api run dev    # API on :3001
pnpm --filter @coinflip/web run dev    # Web on :3000 (Turbopack)

# Build
pnpm build                              # All packages
pnpm --filter @coinflip/api run build   # API → dist/
pnpm --filter @coinflip/web run build   # Web → .next/

# Lint, typecheck, test
pnpm lint
pnpm typecheck
pnpm test
pnpm test:watch

# Database (Drizzle Kit, operates on packages/db)
pnpm db:generate    # Generate migration files from schema changes
pnpm db:migrate     # Run migrations
pnpm db:push        # Push schema directly (dev only)
pnpm db:studio      # Visual DB browser

# API client regeneration (after OpenAPI spec changes)
pnpm generate:openapi   # Rebuild spec from Zod schemas
pnpm generate:api       # Orval → React Query hooks

# Formatting
pnpm format             # Prettier

# Smart contract (Rust/CosmWasm)
cd contracts/coinflip-pvp-vault && cargo build
cargo test                               # Unit + integration tests
cargo run-script optimize                # Optimized .wasm for deployment

# Deployment scripts
pnpm --filter scripts tsx scripts/deploy-contract.ts
pnpm --filter scripts tsx scripts/grant-authz.ts
```

## Architecture Overview

PvP CoinFlip dApp on Axiome Chain. Two players wager COIN (CW20 token) on heads/tails. Winner gets 2x stake minus 10% commission. "1-click" UX via Cosmos x/authz delegation + x/feegrant gas sponsorship.

### Monorepo Layout (pnpm workspaces + Turborepo)

- **`apps/api/`** — Hono backend (REST + WebSocket), runs on Node.js 22
- **`apps/web/`** — Next.js 15 frontend (App Router, React 19, Tailwind CSS 4)
- **`contracts/coinflip-pvp-vault/`** — CosmWasm 1.4 smart contract (Rust)
- **`packages/shared/`** — Zod schemas, types, constants (single source of truth)
- **`packages/db/`** — Drizzle ORM schema + migrations (PostgreSQL)
- **`packages/api-client/`** — Orval-generated React Query hooks from OpenAPI spec
- **`packages/tsconfig/`** — Shared TypeScript configs
- **`packages/eslint-config/`** — Shared ESLint configs (base + next)
- **`tooling/openapi/`** — OpenAPI 3.1 spec generation from Zod schemas
- **`scripts/`** — Deployment, authz grants, test scenarios, diagnostics

### Data Flow

```
User → Frontend (Next.js) → API (Hono) → Relayer (MsgExec via CosmJS) → Axiome Chain
                                       ← Indexer (polls blocks) ← Chain events
                                       → PostgreSQL (Drizzle) for fast reads
                                       → WebSocket broadcast → Frontend cache invalidation
```

### Key Architectural Patterns

1. **Async 202 pattern**: API returns 202 immediately; relayer broadcasts tx in background; indexer confirms on-chain state and updates DB; WebSocket notifies frontend.

2. **Commit-reveal for fairness**: Maker generates secret client-side, submits `SHA256("coinflip_v1" || maker_addr || side || secret)` as commitment. On reveal, contract recomputes and verifies. Secret never sent to backend before reveal phase.

3. **Relayer with sequence management**: Single relayer key submits MsgExec on behalf of users. Mutex-based broadcast queue serializes transactions to prevent nonce races. Sequence tracked in-memory, refreshed from chain on mismatch.

4. **Three-layer optimistic UI**: React Query cache (server state) + PendingBalanceContext (in-flight balance changes) + usePendingBets (unconfirmed bet states). WebSocket events trigger debounced cache invalidation.

5. **Contract-first API design**: Zod schemas → zod-openapi → OpenAPI 3.1 spec → Swagger UI + Orval codegen. Types derived from Zod, never duplicated.

6. **Authz safety**: Always use `ContractExecutionAuthorization` with `AcceptedMessageKeysFilter` scoped to the single CoinFlip contract. NEVER use `GenericAuthorization` on `MsgExecuteContract`.

### Bet State Machine (on-chain)

```
OPEN → ACCEPTED → REVEALED (maker reveals within timeout)
OPEN → ACCEPTED → TIMEOUT_CLAIMED (acceptor claims after timeout)
OPEN → CANCELED (maker cancels)
```

### Database

Chain is source of truth; PostgreSQL (Neon) is for performance, pagination, analytics. Schema in `packages/db/src/schema/` — one file per table. Key tables: `bets`, `vault_balances`, `users`, `sessions`, `tx_events`, `treasury_ledger`, `referrals`, `pending_bet_secrets`.

### Infrastructure

- Frontend: Vercel (Next.js)
- API: Railway (Node.js)
- Database: Neon PostgreSQL
- Cache: Redis
- Blockchain: Axiome Chain (custom Cosmos SDK chain)

## Coding Conventions

### TypeScript

- Strict mode, ESM only (`"type": "module"`)
- `type` over `interface` unless extending. No `any` — use `unknown` + Zod/type guards
- Path aliases: `@/` for src root in each app
- Consistent type imports: `import type { Foo } from '...'`

### Naming

- Files: `kebab-case.ts` / `kebab-case.tsx`
- Components: PascalCase. Types: PascalCase. Constants: UPPER_SNAKE_CASE
- Zod schemas: PascalCase + `Schema` suffix. DB tables: snake_case

### Frontend

- Use Orval-generated React Query hooks — never write fetch calls manually
- WebSocket connection with exponential backoff reconnection
- Loading skeletons, not spinners. Optimistic UI updates.
- Secrets (commit-reveal) stored in React state only — NEVER localStorage

### Backend

- Hono routes with `zValidator('json', schema)` for request validation
- Structured errors with codes, caught by global error handler
- pino for logging — no console.log in production

### Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

### Testing

- Vitest for unit/integration. Test files colocated: `*.test.ts` next to source
- Hono test client (`app.request()`) for API routes
- Orval-generated MSW handlers for frontend mocking
- Smart contract: `cargo test` with `cw-multi-test` for integration tests

## Critical Gotchas

- **React hooks ordering**: Never place hooks after early returns — causes runtime Error #310 not caught by TypeScript or build, only crashes in production.
- **Commitment encoding**: Must normalize to consistent format (HEX vs BASE64 mismatch caused BET_NO_SECRET bug).
- **Nonce races**: Relayer uses mutex-based broadcast queue. See `apps/api/src/services/sequence-manager.ts`.
- **Generated code**: Never manually edit files in `packages/api-client/src/generated/`. Regenerate with `pnpm generate:api`.
- **On-chain randomness**: Never use block hash. Always commit-reveal or external beacon.
