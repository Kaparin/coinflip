use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128};
use cw20::Cw20ReceiveMsg;

#[cw_serde]
pub struct InstantiateMsg {
    /// CW20 LAUNCH token contract address
    pub launch_cw20: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// CW20 receive hook — handles Stake via CW20 Send.
    /// User calls LAUNCH.Send { contract: staking, amount, msg: {"stake":{}} }
    Receive(Cw20ReceiveMsg),

    /// Unstake LAUNCH tokens. Contract sends CW20 back to caller.
    Unstake { amount: Uint128 },

    /// Claim accumulated AXM rewards.
    Claim {},

    /// Distribute native AXM rewards to all stakers.
    /// Anyone can call this — attach uaxm funds.
    /// Typically called by project treasury sweeps.
    Distribute {},

    /// Admin: transfer admin role.
    TransferAdmin { new_admin: String },
}

/// Sub-message for CW20 Receive hook
#[cw_serde]
pub enum ReceiveMsg {
    /// Stake LAUNCH tokens
    Stake {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Get contract configuration
    #[returns(ConfigResponse)]
    Config {},

    /// Get global staking state
    #[returns(StateResponse)]
    State {},

    /// Get staker info for a specific address
    #[returns(StakerInfoResponse)]
    StakerInfo { address: String },
}

// ---- Response types ----

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub launch_cw20: Addr,
}

#[cw_serde]
pub struct StateResponse {
    pub total_staked: Uint128,
    pub reward_per_token: Uint128,
    pub total_distributed: Uint128,
    pub total_claimed: Uint128,
    pub total_stakers: u64,
    /// AXM balance currently held by contract (undistributed + unclaimed)
    pub axm_balance: Uint128,
}

#[cw_serde]
pub struct StakerInfoResponse {
    pub staked: Uint128,
    /// Current pending (claimable) AXM rewards
    pub pending_rewards: Uint128,
    pub total_claimed: Uint128,
}
