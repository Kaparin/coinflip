use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128};
use cw20::Cw20ReceiveMsg;

#[cw_serde]
pub struct InstantiateMsg {
    /// CW20 COIN token contract address
    pub coin_cw20: String,
    /// Rate numerator (default 1)
    pub rate_num: u64,
    /// Rate denominator (default 1)
    pub rate_denom: u64,
    /// Whether presale starts enabled
    pub enabled: bool,
    /// Max uaxm per single buy tx (0 = no limit)
    #[serde(default)]
    pub max_per_tx: Uint128,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Buy COIN tokens by sending native uaxm.
    /// Attach uaxm funds to this message.
    Buy {},

    /// CW20 receive hook — used to fund the presale pool with COIN tokens.
    /// Only accepts tokens from the configured coin_cw20 contract.
    Receive(Cw20ReceiveMsg),

    /// Admin: update presale configuration
    UpdateConfig {
        rate_num: Option<u64>,
        rate_denom: Option<u64>,
        enabled: Option<bool>,
        max_per_tx: Option<Uint128>,
    },

    /// Admin: withdraw accumulated native AXM (uaxm)
    WithdrawAxm { amount: Uint128 },

    /// Admin: withdraw unsold COIN tokens back
    WithdrawCoin { amount: Uint128 },
}

/// CW20 receive sub-message
#[cw_serde]
pub enum ReceiveMsg {
    /// Fund the presale pool with COIN tokens
    Fund {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Get presale configuration
    #[returns(ConfigResponse)]
    Config {},

    /// Get presale pool status (available COIN, accumulated AXM)
    #[returns(StatusResponse)]
    Status {},
}

// ---- Response types ----

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub coin_cw20: Addr,
    pub rate_num: u64,
    pub rate_denom: u64,
    pub enabled: bool,
    pub max_per_tx: Uint128,
    pub total_axm_received: Uint128,
    pub total_coin_sold: Uint128,
}

#[cw_serde]
pub struct StatusResponse {
    /// COIN tokens available for sale in the pool
    pub coin_available: Uint128,
    /// Native AXM (uaxm) balance held by the contract
    pub axm_balance: Uint128,
    /// Current rate
    pub rate_num: u64,
    pub rate_denom: u64,
    pub enabled: bool,
}
