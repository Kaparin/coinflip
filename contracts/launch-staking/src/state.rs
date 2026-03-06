use cosmwasm_std::{Addr, Uint128};
use cosmwasm_schema::cw_serde;
use cw_storage_plus::{Item, Map};

/// Precision multiplier for reward_per_token calculations (10^18).
/// This prevents rounding errors when distributing small rewards across large stakes.
pub const PRECISION: u128 = 1_000_000_000_000_000_000;

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    /// CW20 LAUNCH token contract address
    pub launch_cw20: Addr,
}

#[cw_serde]
pub struct GlobalState {
    /// Total LAUNCH tokens staked across all users (in micro-LAUNCH)
    pub total_staked: Uint128,
    /// Accumulated reward per token, scaled by PRECISION.
    /// Updated each time `distribute()` is called.
    pub reward_per_token: Uint128,
    /// Total AXM (uaxm) ever distributed as rewards
    pub total_distributed: Uint128,
    /// Total AXM (uaxm) ever claimed by stakers
    pub total_claimed: Uint128,
    /// Number of unique stakers (addresses with stake > 0)
    pub total_stakers: u64,
}

impl Default for GlobalState {
    fn default() -> Self {
        Self {
            total_staked: Uint128::zero(),
            reward_per_token: Uint128::zero(),
            total_distributed: Uint128::zero(),
            total_claimed: Uint128::zero(),
            total_stakers: 0,
        }
    }
}

#[cw_serde]
pub struct StakerInfo {
    /// Amount of LAUNCH tokens staked by this user
    pub staked: Uint128,
    /// The reward_per_token snapshot at the time of last stake/unstake/claim.
    /// Used to calculate pending rewards: (global.rpt - staker.rpt_snapshot) * staked / PRECISION
    pub reward_per_token_snapshot: Uint128,
    /// Accumulated but unclaimed AXM rewards (uaxm)
    pub pending_rewards: Uint128,
    /// Total AXM ever claimed by this staker
    pub total_claimed: Uint128,
}

impl Default for StakerInfo {
    fn default() -> Self {
        Self {
            staked: Uint128::zero(),
            reward_per_token_snapshot: Uint128::zero(),
            pending_rewards: Uint128::zero(),
            total_claimed: Uint128::zero(),
        }
    }
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const STATE: Item<GlobalState> = Item::new("state");
/// Per-address staker info. Key = staker address string.
pub const STAKERS: Map<&str, StakerInfo> = Map::new("stakers");
