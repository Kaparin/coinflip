use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Order, Response,
    StdResult,
};
use cw2::{ensure_from_older_version, set_contract_version};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::state::{Config, CONFIG, NEXT_BET_ID, PENDING_ADMIN, VAULT_BALANCES, BETS, USER_OPEN_BET_COUNT, DAILY_USAGE};

const CONTRACT_NAME: &str = "crates.io:coinflip-pvp-vault";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // Validate instantiation parameters
    if msg.commission_bps > 5000 {
        return Err(ContractError::InvalidCommission { max_bps: 5000 });
    }
    if msg.reveal_timeout_secs < 60 || msg.reveal_timeout_secs > 86400 {
        return Err(ContractError::InvalidTimeout { min: 60, max: 86400 });
    }

    let config = Config {
        admin: info.sender,
        token_cw20: deps.api.addr_validate(&msg.token_cw20)?,
        treasury: deps.api.addr_validate(&msg.treasury)?,
        commission_bps: msg.commission_bps,
        min_bet: msg.min_bet,
        reveal_timeout_secs: msg.reveal_timeout_secs,
        max_open_per_user: msg.max_open_per_user,
        max_daily_amount_per_user: msg.max_daily_amount_per_user,
        bet_ttl_secs: msg.bet_ttl_secs,
    };

    CONFIG.save(deps.storage, &config)?;
    NEXT_BET_ID.save(deps.storage, &1u64)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", config.admin.to_string())
        .add_attribute("token_cw20", config.token_cw20.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Receive(cw20_msg) => {
            crate::execute::deposit::execute_receive(deps, env, info, cw20_msg)
        }
        ExecuteMsg::Withdraw { amount } => {
            crate::execute::withdraw::execute_withdraw(deps, env, info, amount)
        }
        ExecuteMsg::CreateBet { amount, commitment } => {
            crate::execute::create_bet::execute_create_bet(deps, env, info, amount, commitment)
        }
        ExecuteMsg::CancelBet { bet_id } => {
            crate::execute::cancel_bet::execute_cancel_bet(deps, env, info, bet_id)
        }
        ExecuteMsg::AcceptBet { bet_id, guess } => {
            crate::execute::accept_bet::execute_accept_bet(deps, env, info, bet_id, guess)
        }
        ExecuteMsg::AcceptAndReveal { bet_id, guess, side, secret } => {
            crate::execute::accept_and_reveal::execute_accept_and_reveal(
                deps, env, info, bet_id, guess, side, secret,
            )
        }
        ExecuteMsg::Reveal { bet_id, side, secret } => {
            crate::execute::reveal::execute_reveal(deps, env, info, bet_id, side, secret)
        }
        ExecuteMsg::ClaimTimeout { bet_id } => {
            crate::execute::claim_timeout::execute_claim_timeout(deps, env, info, bet_id)
        }
        ExecuteMsg::UpdateConfig {
            treasury,
            commission_bps,
            min_bet,
            reveal_timeout_secs,
            max_open_per_user,
            max_daily_amount_per_user,
            bet_ttl_secs,
        } => execute_update_config(
            deps,
            info,
            treasury,
            commission_bps,
            min_bet,
            reveal_timeout_secs,
            max_open_per_user,
            max_daily_amount_per_user,
            bet_ttl_secs,
        ),
        ExecuteMsg::TransferAdmin { new_admin } => execute_transfer_admin(deps, info, new_admin),
        ExecuteMsg::AcceptAdmin {} => execute_accept_admin(deps, info),
    }
}

/// Admin-only: update contract configuration.
/// Only the fields that are `Some(...)` get updated.
fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    treasury: Option<String>,
    commission_bps: Option<u16>,
    min_bet: Option<cosmwasm_std::Uint128>,
    reveal_timeout_secs: Option<u64>,
    max_open_per_user: Option<u16>,
    max_daily_amount_per_user: Option<cosmwasm_std::Uint128>,
    bet_ttl_secs: Option<u64>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    if let Some(t) = treasury {
        config.treasury = deps.api.addr_validate(&t)?;
    }
    if let Some(bps) = commission_bps {
        if bps > 5000 {
            return Err(ContractError::InvalidCommission { max_bps: 5000 });
        }
        config.commission_bps = bps;
    }
    if let Some(mb) = min_bet {
        config.min_bet = mb;
    }
    if let Some(rt) = reveal_timeout_secs {
        if rt < 60 || rt > 86400 {
            return Err(ContractError::InvalidTimeout { min: 60, max: 86400 });
        }
        config.reveal_timeout_secs = rt;
    }
    if let Some(mo) = max_open_per_user {
        config.max_open_per_user = mo;
    }
    if let Some(md) = max_daily_amount_per_user {
        config.max_daily_amount_per_user = md;
    }
    if let Some(ttl) = bet_ttl_secs {
        // 0 = disabled; otherwise must be 300s..604800s (5 min to 7 days)
        if ttl > 0 && (ttl < 300 || ttl > 604800) {
            return Err(ContractError::InvalidTimeout { min: 300, max: 604800 });
        }
        config.bet_ttl_secs = ttl;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "update_config")
        .add_attribute("admin", info.sender.to_string()))
}

/// Step 1 of 2-step admin transfer: current admin proposes a new admin.
fn execute_transfer_admin(
    deps: DepsMut,
    info: MessageInfo,
    new_admin: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    let validated = deps.api.addr_validate(&new_admin)?;
    PENDING_ADMIN.save(deps.storage, &validated)?;

    Ok(Response::new()
        .add_attribute("action", "transfer_admin")
        .add_attribute("pending_admin", validated.to_string()))
}

/// Step 2 of 2-step admin transfer: pending admin accepts ownership.
fn execute_accept_admin(
    deps: DepsMut,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let pending = PENDING_ADMIN.may_load(deps.storage)?;
    match pending {
        Some(addr) if addr == info.sender => {
            let mut config = CONFIG.load(deps.storage)?;
            config.admin = addr.clone();
            CONFIG.save(deps.storage, &config)?;
            PENDING_ADMIN.remove(deps.storage);

            Ok(Response::new()
                .add_attribute("action", "accept_admin")
                .add_attribute("new_admin", addr.to_string()))
        }
        _ => Err(ContractError::Unauthorized),
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(
    deps: DepsMut,
    _env: Env,
    msg: MigrateMsg,
) -> Result<Response, ContractError> {
    let version = ensure_from_older_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let mut config = CONFIG.load(deps.storage)?;

    // v0.5.0: allow switching CW20 token address during migration
    if let Some(new_token) = msg.token_cw20 {
        config.token_cw20 = deps.api.addr_validate(&new_token)?;
    }

    // v0.5.1: full state reset (bets, vaults, counters)
    let mut cleared_count: u64 = 0;
    if msg.reset_state {
        // Clear all vault balances
        let vault_keys: Vec<_> = VAULT_BALANCES
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        for key in &vault_keys {
            VAULT_BALANCES.remove(deps.storage, key);
        }

        // Clear all bets
        let bet_keys: Vec<_> = BETS
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        for key in &bet_keys {
            BETS.remove(deps.storage, *key);
        }

        // Clear open bet counts
        let obc_keys: Vec<_> = USER_OPEN_BET_COUNT
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        for key in &obc_keys {
            USER_OPEN_BET_COUNT.remove(deps.storage, key);
        }

        // Clear daily usage
        let du_keys: Vec<_> = DAILY_USAGE
            .keys(deps.storage, None, None, Order::Ascending)
            .collect::<StdResult<Vec<_>>>()?;
        for key in &du_keys {
            DAILY_USAGE.remove(deps.storage, (&key.0, key.1));
        }

        // Reset bet counter
        NEXT_BET_ID.save(deps.storage, &1u64)?;

        cleared_count = (vault_keys.len() + bet_keys.len() + obc_keys.len() + du_keys.len()) as u64;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("from_version", version.to_string())
        .add_attribute("to_version", CONTRACT_VERSION)
        .add_attribute("token_cw20", config.token_cw20.to_string())
        .add_attribute("state_reset", msg.reset_state.to_string())
        .add_attribute("cleared_entries", cleared_count.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&crate::query::query_config(deps)?),
        QueryMsg::VaultBalance { address } => {
            to_json_binary(&crate::query::query_vault_balance(deps, address)?)
        }
        QueryMsg::Bet { bet_id } => to_json_binary(&crate::query::query_bet(deps, bet_id)?),
        QueryMsg::OpenBets { start_after, limit } => {
            to_json_binary(&crate::query::query_open_bets(deps, env, start_after, limit)?)
        }
        QueryMsg::UserBets {
            address,
            start_after,
            limit,
        } => to_json_binary(&crate::query::query_user_bets(
            deps,
            address,
            start_after,
            limit,
        )?),
    }
}
