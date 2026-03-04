# AXM Economy Migration Plan

> **Status**: Blueprint — implementation deferred until game interface, logic, and tests are finalized.
> **Date**: 2026-03-03
> **Author**: Generated from codebase analysis

---

## 1. Context & Motivation

The CoinFlip game currently uses **COIN** (CW20 token) for all betting, payouts, commissions, referral rewards, and jackpots. This migration switches the game economy to **AXM** (native Axiome chain token) as the primary game currency. COIN becomes a utility-only token for subscriptions, cosmetics, and achievements.

**Why native AXM?**
- Simpler deposit UX — single `MsgExecuteContract` with `funds` attached (vs. CW20 two-step: approve → send)
- Lower gas costs — native bank operations are cheaper than CW20 wasm calls
- Better chain integration — AXM is the native denomination, no CW20 approval overhead
- Cleaner token roles — AXM for gameplay, COIN/LAUNCH for utility features

---

## 2. Current Architecture Snapshot

### Token & Contract
| Component | Current Value |
|-----------|---------------|
| Game currency | COIN (CW20: `axm1cv5er0wsla3u33w6rkn7ckxpn88huqh9aw0xpu0pagksege7v7nsn8qdhs`) |
| Contract | `coinflip-pvp-vault` v0.6.0 |
| Deposit method | CW20 `Send` → contract `Receive` hook |
| Withdrawal method | `Cw20ExecuteMsg::Transfer` from contract to user |
| Denomination | 6 decimals (1 COIN = 1,000,000 micro-COIN) |

### Commission Structure (10% of pot)
| Split | Current BPS | Percentage |
|-------|-------------|------------|
| Referral L1 | 300 | 3.0% |
| Referral L2 | 150 | 1.5% |
| Referral L3 | 50 | 0.5% |
| **Referral total** | **500** | **5.0%** |
| Jackpot (5 tiers × 20) | 100 | 1.0% |
| Partner | Variable | Variable |
| **Treasury remainder** | ~400 | ~4.0% |

### Key Code References
| File | Purpose |
|------|---------|
| `contracts/coinflip-pvp-vault/src/state.rs:12-25` | Config struct with `token_cw20: Addr` |
| `contracts/coinflip-pvp-vault/src/msg.rs:6-17` | InstantiateMsg with `token_cw20: String` |
| `contracts/coinflip-pvp-vault/src/execute/deposit.rs` | CW20 Receive hook — validates `info.sender == config.token_cw20` |
| `contracts/coinflip-pvp-vault/src/execute/withdraw.rs` | CW20 Transfer via `WasmMsg::Execute` |
| `packages/shared/src/constants.ts:9-10` | `LAUNCH_DECIMALS = 6`, `LAUNCH_MULTIPLIER = 1_000_000` |
| `packages/shared/src/constants.ts:56` | `COMMISSION_BPS = 1000` (10%) |
| `packages/shared/src/constants.ts:69` | `BET_PRESETS = [1, 5, 10, 50, 100, 500]` |
| `apps/api/src/config/env.ts:27-28` | `COINFLIP_CONTRACT_ADDR`, `LAUNCH_CW20_ADDR` |
| `apps/api/src/services/referral.service.ts:36-39` | BPS levels: 300/150/50, max 500 |
| `packages/db/src/schema/vault-balances.ts` | Vault: available/locked/bonus/offchainSpent |
| `packages/db/src/schema/bets.ts` | Bet table (no `denom` column) |
| `packages/db/src/schema/treasury-ledger.ts:7` | Already has `denom` column (default: `'COIN'`) |

---

## 3. New Economy Design

### Currency Roles

| Currency | Token Type | Role |
|----------|-----------|------|
| **AXM** | Native (`uaxm`) | Bets, payouts, commissions, referral rewards, jackpot prizes, staker rewards |
| **COIN/LAUNCH** | CW20 (unchanged) | VIP subscriptions, bet pins, sponsored announcements, tournament fees, achievements, cosmetics, staking |

### New Commission Structure (10% of pot)

```
10% total commission (1000 BPS, unchanged on-chain)
├── Referral rewards:    2.5% of pot (250 BPS)
│   ├── Level 1: 1.5%   (150 BPS)
│   ├── Level 2: 0.7%   (70 BPS)
│   └── Level 3: 0.3%   (30 BPS)
├── Jackpot pools:       1.0% of pot (100 BPS, 5 tiers × 20 BPS)
├── LAUNCH reward pool:  1.5% of pot (150 BPS)
│   ├── Stakers: 1.2%   (120 BPS) → on-chain staking contract
│   └── Holders: 0.3%   (30 BPS)  → off-chain snapshots
└── Platform treasury:   5.0% of pot (500 BPS)
```

### AXM Denomination
- AXM uses 6 decimals: `1 AXM = 1,000,000 uaxm`
- Same precision as COIN — formatting functions can be reused
- Bet presets: TBD (e.g., `[0.1, 0.5, 1, 5, 10, 50]` AXM — depends on AXM price)

---

## 4. Phase 1 — New Smart Contract (`coinflip-pvp-axm`)

### CW20 → Native Coin Differences

| Aspect | Current (`coinflip-pvp-vault`) | New (`coinflip-pvp-axm`) |
|--------|-------------------------------|--------------------------|
| Deposit | CW20 `Send` → `Receive` hook | `ExecuteMsg::Deposit {}` with `info.funds` |
| Withdrawal | `Cw20ExecuteMsg::Transfer` via WasmMsg | `BankMsg::Send` (native) |
| Token validation | `info.sender == config.token_cw20` | Check `info.funds` contains exactly `uaxm` |
| Config field | `token_cw20: Addr` | `accepted_denom: String` |
| Dependencies | `cw20 = "1.1"` | `cw-utils` (for `must_pay`) |
| Admin sweep | CW20 balance query | Bank balance query |

### Config Struct Change

```rust
// contracts/coinflip-pvp-vault/src/state.rs (CURRENT)
pub struct Config {
    pub admin: Addr,
    pub token_cw20: Addr,         // ← CW20 contract address
    pub treasury: Addr,
    pub commission_bps: u16,
    pub min_bet: Uint128,
    pub reveal_timeout_secs: u64,
    pub max_open_per_user: u16,
    pub max_daily_amount_per_user: Uint128,
    pub bet_ttl_secs: u64,
}

// contracts/coinflip-pvp-axm/src/state.rs (NEW)
pub struct Config {
    pub admin: Addr,
    pub accepted_denom: String,   // ← "uaxm" (native denomination)
    pub treasury: Addr,
    pub commission_bps: u16,
    pub min_bet: Uint128,
    pub reveal_timeout_secs: u64,
    pub max_open_per_user: u16,
    pub max_daily_amount_per_user: Uint128,
    pub bet_ttl_secs: u64,
}
```

### InstantiateMsg Change

```rust
// CURRENT
pub struct InstantiateMsg {
    pub token_cw20: String,          // CW20 contract address
    pub treasury: String,
    pub commission_bps: u16,
    // ...
}

// NEW
pub struct InstantiateMsg {
    pub accepted_denom: String,      // "uaxm"
    pub treasury: String,
    pub commission_bps: u16,
    // ... (everything else identical)
}
```

### ExecuteMsg Change

```rust
// CURRENT
pub enum ExecuteMsg {
    Receive(Cw20ReceiveMsg),     // CW20 deposit hook
    Withdraw { amount: Uint128 },
    // ... (CreateBet, AcceptBet, etc. — unchanged)
    AdminSweep { recipient: Option<String> }, // Sweeps CW20 orphans
}

// NEW
pub enum ExecuteMsg {
    Deposit {},                   // Native deposit (reads info.funds)
    Withdraw { amount: Uint128 },
    // ... (CreateBet, AcceptBet, etc. — unchanged)
    AdminSweep { recipient: Option<String> }, // Sweeps native orphans
}
```

### Deposit Logic Change

```rust
// CURRENT: contracts/coinflip-pvp-vault/src/execute/deposit.rs
fn execute_receive(deps, _env, info, cw20_msg) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.token_cw20 {
        return Err(ContractError::InvalidToken { expected: config.token_cw20.to_string() });
    }
    let depositor = deps.api.addr_validate(&cw20_msg.sender)?;
    let amount = cw20_msg.amount;
    // credit vault...
}

// NEW: contracts/coinflip-pvp-axm/src/execute/deposit.rs
use cw_utils::must_pay;

fn execute_deposit(deps, _env, info) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let amount = must_pay(&info, &config.accepted_denom)
        .map_err(|_| ContractError::InvalidDenom {
            expected: config.accepted_denom.clone(),
        })?;
    let depositor = info.sender;
    // credit vault (same logic)...
}
```

### Withdrawal Logic Change

```rust
// CURRENT: contracts/coinflip-pvp-vault/src/execute/withdraw.rs
let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
    contract_addr: config.token_cw20.to_string(),
    msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
        recipient: info.sender.to_string(),
        amount,
    })?,
    funds: vec![],
});

// NEW: contracts/coinflip-pvp-axm/src/execute/withdraw.rs
use cosmwasm_std::{BankMsg, Coin};

let transfer_msg = CosmosMsg::Bank(BankMsg::Send {
    to_address: info.sender.to_string(),
    amount: vec![Coin {
        denom: config.accepted_denom.clone(),
        amount,
    }],
});
```

### Error Type Changes

```rust
// REMOVE:
InvalidToken { expected: String },  // CW20-specific

// ADD:
InvalidDenom { expected: String },  // Wrong native denom
InvalidFunds,                       // Zero amount or multiple coins
```

### Cargo.toml Changes

```toml
# REMOVE:
cw20 = "1.1"

# ADD:
cw-utils = "1.0"   # for must_pay() helper
```

### Files to Create

| File | Action |
|------|--------|
| `contracts/coinflip-pvp-axm/` | Fork of `coinflip-pvp-vault/` |
| `contracts/coinflip-pvp-axm/Cargo.toml` | Replace `cw20` → `cw-utils` |
| `contracts/coinflip-pvp-axm/src/state.rs` | `token_cw20` → `accepted_denom: String` |
| `contracts/coinflip-pvp-axm/src/msg.rs` | `Receive(Cw20ReceiveMsg)` → `Deposit {}` |
| `contracts/coinflip-pvp-axm/src/error.rs` | `InvalidToken` → `InvalidDenom` + `InvalidFunds` |
| `contracts/coinflip-pvp-axm/src/execute/deposit.rs` | CW20 Receive → `must_pay()` native |
| `contracts/coinflip-pvp-axm/src/execute/withdraw.rs` | CW20 Transfer → `BankMsg::Send` |
| `contracts/coinflip-pvp-axm/src/execute/admin_sweep.rs` | CW20 balance → Bank balance query |
| `contracts/coinflip-pvp-axm/src/contract.rs` | Route `Deposit {}` instead of `Receive()` |
| `contracts/coinflip-pvp-axm/src/tests.rs` | Update all tests for native coin handling |

### Test Plan

- All existing 38+ tests adapted for native coin deposits (`mock_info` with `funds`)
- New tests:
  - Deposit with wrong denom → `InvalidDenom` error
  - Deposit with zero amount → error
  - Deposit with multiple coins → error (exactly one coin required)
  - Deposit with correct denom → success
  - Full bet lifecycle with native AXM
- Deploy to Axiome testnet before mainnet

---

## 5. Phase 2 — LAUNCH Staking & Holder Rewards

### Design Overview

Two-tier reward system for LAUNCH token:
- **Holders** (just hold LAUNCH in wallet) → earn a smaller share of AXM rewards
- **Stakers** (lock LAUNCH in staking contract) → earn a larger share of AXM rewards

This incentivizes active staking (locks liquidity, reduces sell pressure) while still rewarding passive holders.

### Architecture: On-Chain Staking Contract + Off-Chain Holder Snapshots

| Tier | Mechanism | Reward Share | How It Works |
|------|-----------|-------------|--------------|
| **Stakers** | On-chain smart contract (`launch-staking`) | 1.2% of pot (80% of pool) | Synthetix-style `rewardPerToken` math — fully automated |
| **Holders** | Off-chain snapshots (backend) | 0.3% of pot (20% of pool) | Periodic CW20 balance snapshots of registered users |

**Why hybrid?** CW20 contracts don't support enumeration of all holders — you can't iterate token balances from a contract. Staking is on-chain (trustless, automated), holder rewards are off-chain (backend snapshots of known users).

---

### 5.1 Staking Smart Contract (`launch-staking`)

#### Synthetix RewardPerToken Model

The gold standard for on-chain staking math. No periodic distribution jobs needed — rewards accumulate continuously and claiming is O(1) per user.

**Core state variables:**

```rust
pub struct State {
    pub launch_token: Addr,          // LAUNCH CW20 contract address
    pub reward_denom: String,        // "uaxm"
    pub admin: Addr,
    pub total_staked: Uint128,       // Total LAUNCH staked across all users
    pub reward_per_token_stored: Uint256,  // Accumulated reward per token (scaled by 1e18)
    pub last_update_time: u64,       // Timestamp of last reward update
    pub reward_rate: Uint128,        // AXM per second being distributed (0 until notified)
    pub reward_duration: u64,        // Period over which rewards are spread (e.g., 86400 = 1 day)
    pub period_finish: u64,          // When current reward period ends
}

pub struct StakerInfo {
    pub staked: Uint128,                    // User's staked LAUNCH amount
    pub reward_per_token_paid: Uint256,     // Last checkpoint for this user
    pub pending_rewards: Uint128,           // Accumulated unclaimed AXM
}
```

#### How the Math Works

```
// On every stake/unstake/claim, update global state first:
rewardPerToken = rewardPerTokenStored + (
  (min(now, periodFinish) - lastUpdateTime) * rewardRate * 1e18 / totalStaked
)

// Then calculate user's earned rewards:
earned(user) = user.staked * (rewardPerToken - user.rewardPerTokenPaid) / 1e18
             + user.pendingRewards

// Checkpoint the user:
user.pendingRewards = earned(user)
user.rewardPerTokenPaid = rewardPerToken
```

**Key properties:**
- No loops, no iteration — O(1) per operation
- Rewards accumulate automatically between transactions
- No "distribution job" needed — it's pure math
- Fair: proportional to stake amount and duration
- Gas-efficient: only updates on user interaction

#### Contract Messages

```rust
pub struct InstantiateMsg {
    pub launch_token: String,     // LAUNCH CW20 address
    pub reward_denom: String,     // "uaxm"
    pub reward_duration: u64,     // Seconds per reward period (e.g., 86400 = 1 day)
}

pub enum ExecuteMsg {
    /// Stake LAUNCH tokens (via CW20 Send → Receive hook)
    Receive(Cw20ReceiveMsg),

    /// Unstake (withdraw) LAUNCH tokens back to wallet
    Unstake { amount: Uint128 },

    /// Claim accumulated AXM rewards
    ClaimRewards {},

    /// Unstake all + claim rewards in one tx
    Exit {},

    /// Admin: notify contract of new AXM reward deposit
    /// Called after sending AXM to the contract. Starts/extends reward period.
    NotifyRewardAmount {},

    /// Admin: update reward duration
    UpdateConfig { reward_duration: Option<u64> },

    /// Admin: 2-step admin transfer
    TransferAdmin { new_admin: String },
    AcceptAdmin {},
}

pub enum ReceiveMsg {
    Stake {},  // CW20 Send hook → stake LAUNCH
}

pub enum QueryMsg {
    /// Global staking info
    Config {},
    /// Per-user staking position + pending rewards
    StakerInfo { address: String },
    /// Total staked, reward rate, APY estimate
    StakingStats {},
}
```

#### Reward Flow (How AXM Gets Into the Contract)

```
1. Bet resolves → indexer calculates 1.2% of pot = stakerReward
2. Backend accumulates stakerReward in a buffer (DB or in-memory)
3. Periodically (e.g., every hour or after N bets):
   a. Treasury sends accumulated AXM to staking contract (BankMsg::Send)
   b. Calls staking contract: NotifyRewardAmount {}
   c. Contract reads its native AXM balance, calculates new reward_rate
   d. reward_rate = totalNewReward / reward_duration
   e. Rewards start streaming to stakers over the next period
```

**Example:**
- 100 bets resolve in 1 hour, total pots = 1,000 AXM
- Staker pool = 1,000 × 1.2% = 12 AXM
- Backend sends 12 AXM to staking contract, calls `NotifyRewardAmount`
- Contract sets `reward_rate = 12_000_000 uaxm / 86400 sec ≈ 138 uaxm/sec`
- Over the next 24h, stakers earn proportional to their share of `totalStaked`

#### Deposit (Stake) Logic

```rust
fn execute_receive(deps, env, info, cw20_msg) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.launch_token {
        return Err(ContractError::InvalidToken { ... });
    }
    let staker = deps.api.addr_validate(&cw20_msg.sender)?;
    let amount = cw20_msg.amount;

    // Update global reward state
    update_reward_per_token(deps.storage, &env)?;
    // Checkpoint user rewards before changing their stake
    checkpoint_user(deps.storage, &staker)?;

    // Credit stake
    let mut staker_info = STAKERS.may_load(deps.storage, &staker)?.unwrap_or_default();
    staker_info.staked += amount;
    STAKERS.save(deps.storage, &staker, &staker_info)?;

    let mut state = STATE.load(deps.storage)?;
    state.total_staked += amount;
    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "stake")
        .add_attribute("staker", staker)
        .add_attribute("amount", amount))
}
```

#### Unstake Logic

```rust
fn execute_unstake(deps, env, info, amount) -> Result<Response, ContractError> {
    update_reward_per_token(deps.storage, &env)?;
    checkpoint_user(deps.storage, &info.sender)?;

    let mut staker_info = STAKERS.load(deps.storage, &info.sender)?;
    if staker_info.staked < amount {
        return Err(ContractError::InsufficientStake { ... });
    }
    staker_info.staked -= amount;
    STAKERS.save(deps.storage, &info.sender, &staker_info)?;

    let mut state = STATE.load(deps.storage)?;
    state.total_staked -= amount;
    STATE.save(deps.storage, &state)?;

    // Return LAUNCH tokens via CW20 Transfer
    let transfer_msg = WasmMsg::Execute {
        contract_addr: state.launch_token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(), amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "unstake"))
}
```

#### Claim Rewards Logic

```rust
fn execute_claim_rewards(deps, env, info) -> Result<Response, ContractError> {
    update_reward_per_token(deps.storage, &env)?;
    checkpoint_user(deps.storage, &info.sender)?;

    let mut staker_info = STAKERS.load(deps.storage, &info.sender)?;
    let reward = staker_info.pending_rewards;
    if reward.is_zero() {
        return Err(ContractError::NothingToClaim);
    }
    staker_info.pending_rewards = Uint128::zero();
    STAKERS.save(deps.storage, &info.sender, &staker_info)?;

    // Send AXM reward via BankMsg
    let send_msg = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin { denom: state.reward_denom.clone(), amount: reward }],
    };

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "claim_rewards")
        .add_attribute("reward", reward))
}
```

#### NotifyRewardAmount (Admin)

```rust
fn execute_notify_reward(deps, env, info) -> Result<Response, ContractError> {
    // Only admin or authorized relayer
    let mut state = STATE.load(deps.storage)?;
    update_reward_per_token(deps.storage, &env)?;

    // Read contract's native AXM balance as the reward amount
    let balance = deps.querier.query_balance(&env.contract.address, &state.reward_denom)?;
    // Subtract already-owed rewards to get only the new deposit
    let already_owed = calculate_total_owed(deps.storage)?;
    let new_reward = balance.amount - already_owed;

    if env.block.time.seconds() >= state.period_finish {
        // New period
        state.reward_rate = new_reward / Uint128::from(state.reward_duration);
    } else {
        // Extend existing period: add leftover + new
        let remaining = state.period_finish - env.block.time.seconds();
        let leftover = Uint128::from(remaining) * state.reward_rate;
        state.reward_rate = (leftover + new_reward) / Uint128::from(state.reward_duration);
    }

    state.last_update_time = env.block.time.seconds();
    state.period_finish = env.block.time.seconds() + state.reward_duration;
    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "notify_reward")
        .add_attribute("new_reward", new_reward)
        .add_attribute("reward_rate", state.reward_rate))
}
```

#### Files to Create

| File | Action |
|------|--------|
| `contracts/launch-staking/Cargo.toml` | Dependencies: cosmwasm-std, cw20, cw-storage-plus, cw2 |
| `contracts/launch-staking/src/lib.rs` | Module exports |
| `contracts/launch-staking/src/contract.rs` | Entry points: instantiate, execute, query |
| `contracts/launch-staking/src/msg.rs` | Message types (see above) |
| `contracts/launch-staking/src/state.rs` | State/StakerInfo structs, storage keys |
| `contracts/launch-staking/src/error.rs` | Error types |
| `contracts/launch-staking/src/math.rs` | `update_reward_per_token`, `checkpoint_user`, `earned` |
| `contracts/launch-staking/src/tests.rs` | Full test coverage |

#### Test Plan

- Stake LAUNCH → verify staker balance updates
- Multiple stakers → verify proportional reward distribution
- Unstake partial → rewards continue for remaining stake
- Unstake full → no more rewards accumulate
- Claim rewards → AXM transferred, pending zeroed
- Exit (unstake all + claim) → both in one tx
- NotifyRewardAmount → reward_rate recalculates correctly
- NotifyRewardAmount mid-period → leftover + new correctly combined
- Zero totalStaked when rewards arrive → no division by zero
- Time-weighted: stake early vs stake late → early staker gets more

---

### 5.2 Holder Rewards (Off-Chain Snapshots)

Holders who just keep LAUNCH in their wallet (not staked) earn a smaller share of rewards. Since CW20 contracts don't support holder enumeration, this runs off-chain.

#### How It Works

```
1. Every reward cycle (e.g., daily), backend takes a snapshot:
   - Query CW20 balances of all registered users (users table has addresses)
   - Exclude: staking contract address, treasury, relayer (not "real" holders)
   - Exclude: staked amounts (only count wallet balance, not staked)

2. Calculate holder pool:
   - holderPool = accumulated 0.3% of pots since last snapshot

3. Distribute proportionally:
   - For each holder with balance > 0:
     userShare = userBalance / totalHolderBalance
     userReward = holderPool × userShare
   - Credit to user's AXM vault bonus balance (or separate claimable)

4. Record snapshot in DB for audit trail
```

#### Why Holders Get Less

| Factor | Stakers | Holders |
|--------|---------|---------|
| Reward share | 1.2% of pot (80%) | 0.3% of pot (20%) |
| Mechanism | On-chain, automated | Off-chain, periodic snapshots |
| Liquidity | Locked (can't sell while staked) | Free (can sell anytime) |
| Trust model | Trustless (contract enforces) | Trust backend (off-chain) |
| Gaming resistance | High (time-weighted math) | Medium (snapshot timing) |

**Anti-gaming for holder snapshots:**
- Use time-weighted average balance (TWAB) over the period, not point-in-time snapshot
- Or use random snapshot time within the period (unpredictable)
- Minimum holding threshold (e.g., 10 LAUNCH) to filter dust

#### DB Schema for Holder Rewards

```sql
-- Holder reward snapshots
CREATE TABLE holder_reward_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_holder_balance numeric(38,0) NOT NULL,  -- Sum of all holder balances at snapshot
  total_reward numeric(38,0) NOT NULL,          -- AXM pool for this period (uaxm)
  holder_count integer NOT NULL,
  distributed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual holder reward entries
CREATE TABLE holder_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES holder_reward_snapshots(id),
  user_id uuid NOT NULL REFERENCES users(id),
  wallet_balance numeric(38,0) NOT NULL,   -- LAUNCH balance at snapshot
  reward_amount numeric(38,0) NOT NULL,    -- AXM reward (uaxm)
  claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_id, user_id)
);
```

---

### 5.3 Updated Commission Split

```
1.5% total reward pool (150 BPS of pot)
├── Staker pool:  1.2% (120 BPS) → on-chain staking contract (automated)
└── Holder pool:  0.3% (30 BPS)  → off-chain snapshots (periodic)
```

This split is configurable via `platform_config` table — can adjust the ratio without contract changes.

---

### 5.4 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/staking/info` | No | Global stats: total staked, APY, reward rate, holder pool |
| `GET` | `/api/v1/staking/position` | Yes | User's staked amount, pending staking rewards, pending holder rewards |
| `POST` | `/api/v1/staking/stake` | Yes | Relayer stakes LAUNCH on behalf of user (CW20 Send to contract) |
| `POST` | `/api/v1/staking/unstake` | Yes | Relayer unstakes LAUNCH (contract returns CW20 to user) |
| `POST` | `/api/v1/staking/claim` | Yes | Claim staking rewards (on-chain) + holder rewards (off-chain) |

#### Staking via Relayer (Authz)

Same 1-click UX as betting — user grants `ContractExecutionAuthorization` for the staking contract. Relayer submits `MsgExec` on behalf of user:

```typescript
// Stake: user's LAUNCH → staking contract via CW20 Send
const msg = {
  send: {
    contract: STAKING_CONTRACT,
    amount: microAmount,
    msg: btoa('{"stake":{}}'),
  },
};
const execMsg = MsgExecuteContract.fromPartial({
  sender: userAddr,
  contract: LAUNCH_CW20_ADDR,
  msg: toUtf8(JSON.stringify(msg)),
});
// Wrap in MsgExec...
```

---

### 5.5 Files Summary for Phase 2

#### New Files

| File | Description |
|------|-------------|
| `contracts/launch-staking/` | Staking smart contract (Synthetix model) |
| `packages/db/src/schema/staking.ts` | Holder snapshot tables (2 tables) |
| `apps/api/src/services/staking.service.ts` | Staking orchestration + holder snapshot logic |
| `apps/api/src/routes/staking.ts` | 5 API endpoints |
| `apps/web/src/hooks/use-staking.ts` | React Query hooks |
| `apps/web/src/app/game/staking/page.tsx` | Staking UI page |

---

## 6. Phase 3 — Backend Migration

### 6.1 Environment Config

**File:** `apps/api/src/config/env.ts`

Add to Zod schema:
```typescript
// New env vars
COINFLIP_AXM_CONTRACT_ADDR: z.string().default(''),  // New AXM contract address
GAME_CURRENCY: z.enum(['COIN', 'AXM']).default('COIN'), // Feature flag
AXM_DENOM: z.string().default('uaxm'),
STAKING_ENABLED: z.string().default('false'),
REFERRAL_BPS_L1: z.coerce.number().default(300),      // Override referral BPS
REFERRAL_BPS_L2: z.coerce.number().default(150),
REFERRAL_BPS_L3: z.coerce.number().default(50),
```

Add to `validateProductionEnv()`:
```typescript
// When GAME_CURRENCY=AXM, require AXM contract address
if (env.GAME_CURRENCY === 'AXM') {
  required.push({ key: 'COINFLIP_AXM_CONTRACT_ADDR', label: 'CoinFlip AXM contract address' });
}
```

### 6.2 Relayer Changes

**File:** `apps/api/src/services/relayer.ts`

Current relayer builds `MsgExecuteContract` for CW20 operations. Key changes:

```typescript
// CURRENT: CW20 deposit (two-step: user calls CW20 Send → contract Receive)
const msg = { send: { contract: COINFLIP_CONTRACT, amount, msg: btoa('{"deposit":{}}') } };
const execMsg = MsgExecuteContract.fromPartial({
  sender: userAddr,
  contract: CW20_TOKEN,
  msg: toUtf8(JSON.stringify(msg)),
});

// NEW: Native AXM deposit (single step: user calls contract Deposit with funds)
const msg = { deposit: {} };
const execMsg = MsgExecuteContract.fromPartial({
  sender: userAddr,
  contract: env.COINFLIP_AXM_CONTRACT_ADDR,
  msg: toUtf8(JSON.stringify(msg)),
  funds: [{ denom: 'uaxm', amount }],
});
```

Other changes:
- `relayWithdraw()`: Contract now sends native coins via `BankMsg::Send` (no change in relay call, just different contract)
- `relayCw20Transfer()` → add `relayNativeSend()` for AXM prize transfers
- Contract address: conditional on `GAME_CURRENCY` flag
- Authz grants must be set up for new contract address

### 6.3 Indexer Changes

**File:** `apps/api/src/services/indexer.ts`

- Index new contract address (or both during transition)
- Event structure stays the same (`coinflip.bet_created`, `coinflip.bet_revealed`, etc.)
- Post-resolution commission flow changes:
  1. `distributeReferralRewards()` — 2.5% in AXM (BPS: 150/70/30)
  2. `processJackpotContribution()` — 1.0% to pools
  3. **NEW**: `processStakerRewards()` — 1.2% to staking contract (AXM) + 0.3% to holder pool (DB)
  4. `processPartnerCommission()` — variable BPS
  5. Record remainder to treasury ledger (denom: `'AXM'`)

### 6.4 Referral Service Changes

**File:** `apps/api/src/services/referral.service.ts`

```typescript
// CURRENT (line 36-39)
configService.getNumber('REFERRAL_BPS_LEVEL_1', 300),  // 3.0%
configService.getNumber('REFERRAL_BPS_LEVEL_2', 150),  // 1.5%
configService.getNumber('REFERRAL_BPS_LEVEL_3', 50),   // 0.5%
configService.getNumber('MAX_REFERRAL_BPS_PER_BET', 500),

// NEW defaults (switched when GAME_CURRENCY=AXM)
REFERRAL_BPS_LEVEL_1: 150,  // 1.5%
REFERRAL_BPS_LEVEL_2: 70,   // 0.7%
REFERRAL_BPS_LEVEL_3: 30,   // 0.3%
MAX_REFERRAL_BPS_PER_BET: 250,
```

Other changes:
- Rewards now in AXM (micro-uaxm), not COIN
- Claim sends AXM from treasury (native bank send, not CW20 transfer)
- Branch change cost: remains in COIN (utility token use case)

### 6.5 Jackpot Service Changes

**File:** `apps/api/src/services/jackpot.service.ts`

- Contribution unchanged at 1% of pot (5 tiers × 0.2%)
- Amounts now in uaxm instead of micro-COIN
- Prize payouts in AXM
- `creditWinner()` → add to AXM vault bonus (or direct bank send)
- Tier target amounts need recalculation based on AXM value

### 6.6 Vault Service Changes

**File:** `apps/api/src/services/vault.service.ts`

**Approach: Separate AXM vault table** (clean migration, no schema conflicts)

Add parallel methods:
- `getAxmBalance(userId)` — same logic as `getBalance()`, reads from `axmVaultBalances`
- `syncAxmBalanceFromChain(userId, available, locked, height)` — same height guard
- `lockAxmFunds(userId, amount)` / `unlockAxmFunds()` / `forfeitAxmLocked()`
- `creditAxmWinner(userId, amount)` — add to AXM bonus balance

Or make methods denom-aware with a `table` parameter to avoid code duplication.

### 6.7 Treasury Service Changes

**File:** `apps/api/src/services/treasury.service.ts`

- Treasury now holds AXM (native balance queryable via bank module)
- `sendPrize()`: uses `BankMsg::Send` instead of CW20 transfer
- Treasury ledger: new entries use `denom: 'AXM'` (column already exists, default is `'COIN'`)
- `withdrawFromVault()`: calls new contract's withdraw (returns native AXM)

### 6.8 Event Service Changes

**File:** `apps/api/src/services/event.service.ts`

- `recordCommission(txhash, amount, source)` — pass denom `'AXM'` for new bets
- Add `staker_reward_amount` tracking in the post-resolution flow

---

## 7. Phase 4 — Database Migration

### New Tables

| Table | Purpose |
|-------|---------|
| `axm_vault_balances` | AXM vault (parallel to COIN `vault_balances`) |
| `staking_positions` | COIN/LAUNCH staking positions |
| `staking_reward_pool` | Accumulated AXM rewards for distribution |
| `staking_rewards` | Individual reward distributions |

### AXM Vault Table

```typescript
// packages/db/src/schema/vault-balances.ts — ADD
export const axmVaultBalances = pgTable('axm_vault_balances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  available: numeric('available', { precision: 38, scale: 0 }).notNull().default('0'),
  locked: numeric('locked', { precision: 38, scale: 0 }).notNull().default('0'),
  bonus: numeric('bonus', { precision: 38, scale: 0 }).notNull().default('0'),
  offchainSpent: numeric('offchain_spent', { precision: 38, scale: 0 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  sourceHeight: bigint('source_height', { mode: 'bigint' }),
});
```

### Column Additions to Existing Tables

```sql
-- bets: track denomination for mixed-currency transition
ALTER TABLE bets ADD COLUMN denom text NOT NULL DEFAULT 'COIN';
-- New bets will have denom='AXM', old bets keep 'COIN'

-- referral_rewards: track reward denomination
ALTER TABLE referral_rewards ADD COLUMN denom text NOT NULL DEFAULT 'COIN';

-- referral_balances: separate AXM balance columns
ALTER TABLE referral_balances
  ADD COLUMN unclaimed_axm numeric(38,0) NOT NULL DEFAULT 0,
  ADD COLUMN total_earned_axm numeric(38,0) NOT NULL DEFAULT 0;

-- jackpot_tiers: denomination for target amounts
ALTER TABLE jackpot_tiers ADD COLUMN denom text NOT NULL DEFAULT 'COIN';

-- jackpot_pools: denomination for pool amounts
ALTER TABLE jackpot_pools ADD COLUMN denom text NOT NULL DEFAULT 'COIN';
```

### Drizzle Schema Changes

| File | Changes |
|------|---------|
| `packages/db/src/schema/vault-balances.ts` | Add `axmVaultBalances` export |
| `packages/db/src/schema/bets.ts` | Add `denom: text('denom').notNull().default('COIN')` |
| `packages/db/src/schema/referrals.ts` | Add `denom` to `referralRewards`, `unclaimedAxm`/`totalEarnedAxm` to `referralBalances` |
| `packages/db/src/schema/jackpot.ts` | Add `denom` to `jackpotTiers` and `jackpotPools` |
| `packages/db/src/schema/staking.ts` | **NEW** — 3 staking tables |
| `packages/db/src/schema/index.ts` | Add exports: `axmVaultBalances`, `stakingPositions`, `stakingRewardPool`, `stakingRewards` |
| `packages/db/src/schema/treasury-ledger.ts` | No change needed (already has `denom` column) |

### Migration Method

Use Neon MCP (`mcp__neon__run_sql`) for schema changes, consistent with project convention (see MEMORY.md — `db:push` was used for bootstrap, not `db:migrate`).

---

## 8. Phase 5 — Frontend Migration

### 8.1 Constants & Formatting

**File:** `packages/shared/src/constants.ts`

```typescript
// New constants
export const AXM_DENOM = 'uaxm';
export const AXM_DECIMALS = 6;
export const AXM_MULTIPLIER = 10 ** AXM_DECIMALS; // 1_000_000 (same as LAUNCH)
export const AXM_SYMBOL = 'AXM';
export const COIN_SYMBOL = 'COIN';

// Game currency feature flag
export const GAME_CURRENCY = process.env.NEXT_PUBLIC_GAME_CURRENCY || 'COIN';

// Generic formatter (reuses existing fromMicroLaunch logic)
export function formatAmount(micro: string | number | bigint, symbol?: string): string { ... }
export function formatAXM(micro: string | number | bigint): string { return formatAmount(micro, 'AXM'); }
export function formatCOIN(micro: string | number | bigint): string { return formatAmount(micro, 'COIN'); }

// New bet presets for AXM (TBD based on price)
export const AXM_BET_PRESETS = [0.1, 0.5, 1, 5, 10, 50] as const;

// New commission constants
export const NEW_REFERRAL_BPS = { 1: 150, 2: 70, 3: 30 };
export const STAKER_REWARD_BPS = 150;
export const TEAM_TREASURY_BPS = 500;
```

### 8.2 Balance Display

**File:** `apps/web/src/components/features/vault/balance-display.tsx` (~1,056 lines)

Current state: already shows both AXM native balance and COIN vault balance.

Changes:
- **Primary balance**: AXM vault balance (from `/api/v1/vault/axm-balance`)
- **Secondary balance**: COIN utility balance (existing vault)
- **Deposit flow**: native AXM send to contract (no CW20 approval needed)
  - Simpler: single `MsgExecuteContract` with `funds` attached
  - No `signDepositTxBytes()` for CW20 Send — direct contract call
- **Withdraw flow**: same UX, different contract (BankMsg::Send on withdraw)
- **AXM gas balance**: keep existing `useNativeBalance()` display

### 8.3 Bet Creation

**File:** `apps/web/src/components/features/bets/create-bet-form.tsx`

- Amount in AXM (use `AXM_BET_PRESETS`)
- Min bet check against AXM contract config
- Balance check against AXM vault
- `toMicroLaunch()` → `toMicroAXM()` (same math, different naming)

### 8.4 Bet Cards & History

**File:** `apps/web/src/components/features/bets/bet-card.tsx`

- Display amounts with correct symbol based on `bet.denom`
  - Old bets (denom='COIN') → show "COIN" + `LaunchTokenIcon`
  - New bets (denom='AXM') → show "AXM" + `AxmIcon`
- Tier thresholds may need recalculation for AXM values
- `formatLaunch(amount)` → `formatAmount(amount)` (same decimals)

### 8.5 Referral Dashboard

- Earnings displayed in AXM (for new bets)
- Legacy COIN earnings shown separately with "Legacy" label
- Claim button dispenses AXM (not COIN)
- Level percentages updated: 1.5%, 0.7%, 0.3%
- Branch change: still costs COIN (utility token use case)

### 8.6 Jackpot Display

- Pool amounts in AXM
- Prizes in AXM
- Tier targets recalculated for AXM denomination

### 8.7 VIP / Utility (stays COIN)

- VIP subscription prices: unchanged (50/100/200 COIN)
- Pin prices: unchanged (min 3 COIN)
- Sponsored announcements: unchanged (COIN)
- **These preserve COIN utility value**

### 8.8 Presale

- Keep presale but label it "Buy COIN for utility features"
- Or deprecate if COIN becomes available through staking rewards
- Decision: TBD

### 8.9 Wallet Balance Hooks

**File:** `apps/web/src/hooks/use-wallet-balance.ts`

Current hooks:
- `useWalletBalance()` — CW20 COIN balance (keep for utility features)
- `useNativeBalance()` — AXM native balance (already exists)

Add:
- `useAxmVaultBalance()` — fetch from `/api/v1/vault/axm-balance`
- Rename `useGetVaultBalance()` → `useCoinVaultBalance()` for clarity

### 8.10 Pending Balance Context

**File:** `apps/web/src/contexts/pending-balance-context.tsx`

- Track pending AXM deductions (for bets)
- Keep separate COIN tracking (for utility purchases)
- Make context currency-aware: `addDeduction(microAmount, isBetCreate, denom)`

---

## 9. Phase 6 — Feature Flags & Rollout Strategy

### Environment Variables

```env
# Server-side (apps/api/.env)
GAME_CURRENCY=COIN                     # 'COIN' | 'AXM' — determines active game currency
COINFLIP_AXM_CONTRACT_ADDR=axm1...    # New contract address
STAKING_ENABLED=false                  # Enable LAUNCH staking system
REFERRAL_BPS_L1=300                    # Override: switch to 150 when AXM goes live
REFERRAL_BPS_L2=150                    # Override: switch to 70
REFERRAL_BPS_L3=50                     # Override: switch to 30

# Client-side (apps/web/.env)
NEXT_PUBLIC_GAME_CURRENCY=COIN         # 'COIN' | 'AXM'
NEXT_PUBLIC_AXM_CONTRACT=axm1...       # New contract address
NEXT_PUBLIC_STAKING_ENABLED=false      # Show staking UI
```

### Rollout Phases

#### Pre-Migration (current)
- [ ] Finalize game UI, logic, tests
- [ ] Write and test `coinflip-pvp-axm` contract on testnet
- [ ] Write and test `launch-staking` contract on testnet
- [ ] Implement staking backend service + holder snapshot job
- [ ] Create AXM vault tables and services
- [ ] Build dual-index capability (watch both contracts)

#### Phase A: Deploy New Contract
- [ ] Deploy `coinflip-pvp-axm` to mainnet
- [ ] Configure treasury, commission (1000 BPS)
- [ ] Set up authz grants for relayer on new contract
- [ ] Verify with test bets from team wallets
- [ ] Keep `GAME_CURRENCY=COIN` (old contract still active)

#### Phase B: Enable AXM Betting
- [ ] Switch `GAME_CURRENCY=AXM`
- [ ] Frontend shows AXM vault, AXM bets
- [ ] New bets go through AXM contract
- [ ] Old open COIN bets still playable (dual indexer)
- [ ] Referral rewards for new bets paid in AXM
- [ ] Jackpot pools start fresh in AXM (old COIN pools complete their cycles)
- [ ] Commission structure switches to new BPS

#### Phase C: LAUNCH Staking Launch
- [ ] Deploy `launch-staking` contract to mainnet
- [ ] Set up authz grants for relayer on staking contract
- [ ] Enable `STAKING_ENABLED=true`
- [ ] Users can stake LAUNCH via 1-click (relayer + authz)
- [ ] 1.2% of each AXM pot flows to staking contract (on-chain, automated)
- [ ] 0.3% of each AXM pot accumulates for holder snapshots
- [ ] Holder snapshot job runs periodically (daily)

#### Phase D: Deprecation & Cleanup
- [ ] Announce COIN vault withdrawal deadline
- [ ] Users withdraw remaining COIN from old vault
- [ ] Disable old contract (or let bets expire naturally via 3h TTL)
- [ ] Remove dual-indexing code
- [ ] Clean up feature flag conditionals

### Zero-Downtime Migration
- Both contracts run simultaneously during transition
- Indexer watches both contract addresses
- `bets.denom` column distinguishes COIN vs AXM bets
- Frontend reads `GAME_CURRENCY` flag to determine which vault/contract to use
- Old pending COIN bets resolve normally through old contract
- No forced user action required (old bets auto-expire after 3h TTL)

---

## 10. COIN Utility Preservation

### Utility Features (paid in COIN)

1. **VIP Subscriptions** — Silver 50 / Gold 100 / Diamond 200 COIN
2. **Bet Pins** — Auction slots (min 3 COIN, 2x outbid)
3. **Sponsored Announcements** — Custom announcements (COIN payment)
4. **Referral Branch Change** — Change referrer (1000 COIN)
5. **Tournament Entry Fees** — Future events with COIN buy-in
6. **Avatar Customization** — Name gradients, frames, badges (Diamond VIP, COIN)
7. **LAUNCH Staking** — Stake LAUNCH in on-chain contract to earn AXM rewards (1.2% of pot)
   - Even just holding LAUNCH in wallet earns passive AXM rewards (0.3% of pot)
8. **Future: COIN Market** — P2P COIN/AXM trading

### Potential: COIN Buyback/Burn
- Portion of platform treasury AXM used to buy COIN from market
- Burned or redistributed to stakers
- Creates deflationary pressure, supports COIN price

---

## 11. Complete File Change Matrix

### New Files (7)

| # | File | Description |
|---|------|-------------|
| 1 | `contracts/coinflip-pvp-axm/` | New CoinFlip contract for native AXM (fork of `coinflip-pvp-vault`) |
| 2 | `contracts/launch-staking/` | LAUNCH staking contract (Synthetix RewardPerToken model) |
| 3 | `packages/db/src/schema/staking.ts` | Holder snapshot tables (2 tables) |
| 4 | `apps/api/src/services/staking.service.ts` | Staking orchestration + holder snapshot logic |
| 5 | `apps/api/src/routes/staking.ts` | 5 staking endpoints |
| 6 | `apps/web/src/hooks/use-staking.ts` | React Query hooks for staking |
| 7 | `apps/web/src/app/game/staking/page.tsx` | Staking UI page |

### Modified Files (21)

| # | File | Changes |
|---|------|---------|
| 7 | `apps/api/src/config/env.ts` | New env vars (`COINFLIP_AXM_CONTRACT_ADDR`, `GAME_CURRENCY`, `AXM_DENOM`, `STAKING_ENABLED`) |
| 8 | `apps/api/src/services/relayer.ts` | Native AXM deposit/withdraw, dual contract support |
| 9 | `apps/api/src/services/indexer.ts` | Dual contract indexing, staker reward allocation |
| 10 | `apps/api/src/services/referral.service.ts` | New BPS (150/70/30), AXM rewards |
| 11 | `apps/api/src/services/jackpot.service.ts` | AXM denomination, new tier targets |
| 12 | `apps/api/src/services/vault.service.ts` | AXM vault methods (parallel to COIN) |
| 13 | `apps/api/src/services/treasury.service.ts` | AXM bank sends instead of CW20 |
| 14 | `apps/api/src/services/event.service.ts` | Staker reward tracking, denom field |
| 15 | `apps/api/src/routes/vault.ts` | AXM deposit/withdraw/balance endpoints |
| 16 | `packages/db/src/schema/vault-balances.ts` | Add `axmVaultBalances` table export |
| 17 | `packages/db/src/schema/bets.ts` | Add `denom` column |
| 18 | `packages/db/src/schema/referrals.ts` | Add `denom` to rewards, `unclaimedAxm`/`totalEarnedAxm` to balances |
| 19 | `packages/db/src/schema/jackpot.ts` | Add `denom` to tiers and pools |
| 20 | `packages/db/src/schema/index.ts` | Export new tables |
| 21 | `packages/shared/src/constants.ts` | AXM constants, new BPS, `formatAXM`, `AXM_BET_PRESETS` |
| 22 | `apps/web/src/components/features/vault/balance-display.tsx` | AXM vault as primary display |
| 23 | `apps/web/src/components/features/bets/create-bet-form.tsx` | AXM bet amounts + presets |
| 24 | `apps/web/src/components/features/bets/bet-card.tsx` | Denom-aware amount display |
| 25 | `apps/web/src/hooks/use-wallet-balance.ts` | Add `useAxmVaultBalance()` |
| 26 | `apps/web/src/contexts/pending-balance-context.tsx` | Denom-aware tracking |
| 27 | `apps/web/src/app/game/referral/` | AXM earnings display + legacy COIN label |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users have COIN locked in old vault | Grace period + UI reminder to withdraw before deprecation |
| Old open bets during switchover | Dual indexer processes both; old bets expire naturally (3h TTL) |
| AXM price volatility affects min bet | Admin-configurable `min_bet` on contract; update via `UpdateConfig` |
| Referral rewards split across COIN/AXM | Separate balance columns; UI shows both with "Legacy" label for COIN |
| Jackpot pool mid-cycle during switch | Complete existing COIN pools normally; start fresh AXM pools |
| Staker reward fairness | Synthetix time-weighted math prevents stake-just-before-payout gaming |
| Holder reward gaming | TWAB or random snapshot time prevents buy-before-snapshot attacks |
| Gas costs for native deposits | AXM deposits cheaper than CW20 (one msg vs two); net positive |
| Contract security | Thorough testing, testnet deployment, consider audit before mainnet |
| Authz scope | `ContractExecutionAuthorization` with `AcceptedMessageKeysFilter` scoped to new contract |
| Nonce races during dual-contract operation | Same mutex-based relayer broadcast queue handles both contracts |

---

## 13. Verification Checklist

1. **Smart contract**: `cargo test` — all tests pass with native coin handling
2. **Testnet deployment**: Deploy to Axiome testnet, run full bet lifecycle
3. **Backend typecheck**: `pnpm typecheck` passes for all packages
4. **Dual indexing**: Start indexer watching both contracts; verify event processing
5. **Feature flag**: Toggle `GAME_CURRENCY` between COIN/AXM; verify correct behavior
6. **Staking contract**: Stake LAUNCH → resolve bets → verify rewardPerToken increases → claim AXM
6b. **Holder rewards**: Snapshot → verify proportional AXM distribution to wallet holders
7. **Referral**: New bet with AXM → verify 1.5%/0.7%/0.3% distribution
8. **Jackpot**: Verify contributions in AXM → pool fills → winner gets AXM
9. **Frontend**: Switch locale + currency — all displays correct
10. **Migration dry-run**: Simulate full Phase A→D on staging environment
11. **Authz grants**: Verify relayer has correct grants on new contract
12. **Treasury**: Verify commission flows to correct AXM wallet
