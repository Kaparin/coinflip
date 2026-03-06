use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, CosmosMsg, Deps, DepsMut, Env,
    MessageInfo, Response, StdResult, Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::{Cw20ExecuteMsg, Cw20ReceiveMsg};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg, ReceiveMsg, StakerInfoResponse,
    StateResponse,
};
use crate::state::{Config, GlobalState, StakerInfo, CONFIG, PRECISION, STAKERS, STATE};

const CONTRACT_NAME: &str = "crates.io:launch-staking";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NATIVE_DENOM: &str = "uaxm";

// ─── Instantiate ────────────────────────────────────────────────────────────

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let config = Config {
        admin: info.sender.clone(),
        launch_cw20: deps.api.addr_validate(&msg.launch_cw20)?,
    };
    CONFIG.save(deps.storage, &config)?;
    STATE.save(deps.storage, &GlobalState::default())?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", info.sender)
        .add_attribute("launch_cw20", config.launch_cw20))
}

// ─── Execute ────────────────────────────────────────────────────────────────

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Receive(cw20_msg) => execute_receive(deps, info, cw20_msg),
        ExecuteMsg::Unstake { amount } => execute_unstake(deps, info, amount),
        ExecuteMsg::Claim {} => execute_claim(deps, env, info),
        ExecuteMsg::Distribute {} => execute_distribute(deps, info),
        ExecuteMsg::TransferAdmin { new_admin } => execute_transfer_admin(deps, info, new_admin),
    }
}

/// CW20 receive hook — user sends LAUNCH tokens to stake.
fn execute_receive(
    deps: DepsMut,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only accept LAUNCH CW20 tokens
    if info.sender != config.launch_cw20 {
        return Err(ContractError::InvalidCw20Token);
    }

    let _msg: ReceiveMsg = cosmwasm_std::from_json(&cw20_msg.msg)?;
    // ReceiveMsg::Stake {} is the only variant

    let staker_addr = deps.api.addr_validate(&cw20_msg.sender)?;
    let amount = cw20_msg.amount;

    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    let mut state = STATE.load(deps.storage)?;
    let mut staker = STAKERS
        .may_load(deps.storage, staker_addr.as_str())?
        .unwrap_or_default();

    // Settle pending rewards before changing stake
    settle_rewards(&state, &mut staker);

    // Track unique stakers
    if staker.staked.is_zero() {
        state.total_stakers += 1;
    }

    // Update stake
    staker.staked += amount;
    state.total_staked += amount;

    // Save
    STAKERS.save(deps.storage, staker_addr.as_str(), &staker)?;
    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "stake")
        .add_attribute("staker", staker_addr)
        .add_attribute("amount", amount)
        .add_attribute("total_staked", state.total_staked))
}

/// Unstake LAUNCH tokens — sends CW20 back to the caller.
fn execute_unstake(
    deps: DepsMut,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    let config = CONFIG.load(deps.storage)?;
    let mut state = STATE.load(deps.storage)?;
    let mut staker = STAKERS
        .may_load(deps.storage, info.sender.as_str())?
        .unwrap_or_default();

    if staker.staked < amount {
        return Err(ContractError::InsufficientStake {
            have: staker.staked.to_string(),
            requested: amount.to_string(),
        });
    }

    // Settle pending rewards before changing stake
    settle_rewards(&state, &mut staker);

    staker.staked -= amount;
    state.total_staked -= amount;

    // Track unique stakers
    if staker.staked.is_zero() {
        state.total_stakers -= 1;
    }

    STAKERS.save(deps.storage, info.sender.as_str(), &staker)?;
    STATE.save(deps.storage, &state)?;

    // Send LAUNCH tokens back via CW20 transfer
    let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.launch_cw20.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount,
        })?,
        funds: vec![],
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "unstake")
        .add_attribute("staker", info.sender)
        .add_attribute("amount", amount)
        .add_attribute("total_staked", state.total_staked))
}

/// Claim accumulated AXM rewards.
fn execute_claim(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let state_val = STATE.load(deps.storage)?;
    let mut staker = STAKERS
        .may_load(deps.storage, info.sender.as_str())?
        .unwrap_or_default();

    // Settle any pending rewards
    settle_rewards(&state_val, &mut staker);

    let claimable = staker.pending_rewards;
    if claimable.is_zero() {
        return Err(ContractError::NoPendingRewards);
    }

    // Verify contract has enough AXM balance
    let contract_balance = deps
        .querier
        .query_balance(env.contract.address.to_string(), NATIVE_DENOM)?;
    // If somehow contract has less than claimable (shouldn't happen), cap it
    let send_amount = claimable.min(contract_balance.amount);

    // Update staker
    staker.pending_rewards = Uint128::zero();
    staker.total_claimed += send_amount;

    // Update global claimed counter
    let mut state = STATE.load(deps.storage)?;
    state.total_claimed += send_amount;

    STAKERS.save(deps.storage, info.sender.as_str(), &staker)?;
    STATE.save(deps.storage, &state)?;

    // Send AXM
    let send_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: NATIVE_DENOM.to_string(),
            amount: send_amount,
        }],
    });

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "claim")
        .add_attribute("staker", info.sender)
        .add_attribute("amount", send_amount))
}

/// Distribute native AXM rewards to all stakers.
/// Anyone can call this — attach uaxm funds.
/// The reward is spread proportionally across all staked LAUNCH tokens.
fn execute_distribute(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    // Validate funds
    if info.funds.is_empty() {
        return Err(ContractError::NoFundsSent);
    }
    if info.funds.len() > 1 {
        return Err(ContractError::MultipleDenoms);
    }
    let sent = &info.funds[0];
    if sent.denom != NATIVE_DENOM {
        return Err(ContractError::InvalidDenom {
            denom: sent.denom.clone(),
        });
    }

    let reward_amount = sent.amount;
    if reward_amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    let mut state = STATE.load(deps.storage)?;

    if state.total_staked.is_zero() {
        return Err(ContractError::NothingStaked);
    }

    // Synthetix formula: reward_per_token += (reward_amount * PRECISION) / total_staked
    let rpt_delta = reward_amount
        .checked_mul(Uint128::from(PRECISION))?
        .checked_div(state.total_staked)?;

    state.reward_per_token += rpt_delta;
    state.total_distributed += reward_amount;

    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "distribute")
        .add_attribute("sender", info.sender)
        .add_attribute("amount", reward_amount)
        .add_attribute("reward_per_token", state.reward_per_token)
        .add_attribute("total_distributed", state.total_distributed))
}

/// Admin: transfer admin role to a new address.
fn execute_transfer_admin(
    deps: DepsMut,
    info: MessageInfo,
    new_admin: String,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    config.admin = deps.api.addr_validate(&new_admin)?;
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "transfer_admin")
        .add_attribute("new_admin", new_admin))
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/// Settle (accrue) pending rewards for a staker based on the current global reward_per_token.
/// Must be called BEFORE any change to staker.staked.
fn settle_rewards(state: &GlobalState, staker: &mut StakerInfo) {
    if staker.staked.is_zero() {
        // No stake → just update snapshot to current RPT
        staker.reward_per_token_snapshot = state.reward_per_token;
        return;
    }

    let rpt_diff = state
        .reward_per_token
        .checked_sub(staker.reward_per_token_snapshot)
        .unwrap_or_default();

    if !rpt_diff.is_zero() {
        // earned = staked * rpt_diff / PRECISION
        let earned = staker
            .staked
            .checked_mul(rpt_diff)
            .unwrap_or_default()
            .checked_div(Uint128::from(PRECISION))
            .unwrap_or_default();

        staker.pending_rewards += earned;
    }

    staker.reward_per_token_snapshot = state.reward_per_token;
}

/// Calculate current pending rewards for a staker (read-only, for queries).
fn compute_pending_rewards(state: &GlobalState, staker: &StakerInfo) -> Uint128 {
    if staker.staked.is_zero() {
        return staker.pending_rewards;
    }

    let rpt_diff = state
        .reward_per_token
        .checked_sub(staker.reward_per_token_snapshot)
        .unwrap_or_default();

    let earned = staker
        .staked
        .checked_mul(rpt_diff)
        .unwrap_or_default()
        .checked_div(Uint128::from(PRECISION))
        .unwrap_or_default();

    staker.pending_rewards + earned
}

// ─── Query ──────────────────────────────────────────────────────────────────

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::State {} => to_json_binary(&query_state(deps, env)?),
        QueryMsg::StakerInfo { address } => to_json_binary(&query_staker_info(deps, address)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
        launch_cw20: config.launch_cw20,
    })
}

fn query_state(deps: Deps, env: Env) -> StdResult<StateResponse> {
    let state = STATE.load(deps.storage)?;
    let axm_balance = deps
        .querier
        .query_balance(env.contract.address.to_string(), NATIVE_DENOM)?;

    Ok(StateResponse {
        total_staked: state.total_staked,
        reward_per_token: state.reward_per_token,
        total_distributed: state.total_distributed,
        total_claimed: state.total_claimed,
        total_stakers: state.total_stakers,
        axm_balance: axm_balance.amount,
    })
}

fn query_staker_info(deps: Deps, address: String) -> StdResult<StakerInfoResponse> {
    let state = STATE.load(deps.storage)?;
    let addr = deps.api.addr_validate(&address)?;
    let staker = STAKERS
        .may_load(deps.storage, addr.as_str())?
        .unwrap_or_default();

    let pending = compute_pending_rewards(&state, &staker);

    Ok(StakerInfoResponse {
        staked: staker.staked,
        pending_rewards: pending,
        total_claimed: staker.total_claimed,
    })
}
