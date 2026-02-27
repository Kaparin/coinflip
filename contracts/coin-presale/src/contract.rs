use cosmwasm_std::{
    entry_point, to_json_binary, Binary, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult, Uint128, WasmMsg, BankMsg, Coin,
};
use cw2::set_contract_version;
use cw20::{Cw20ExecuteMsg, Cw20ReceiveMsg};

use crate::error::ContractError;
use crate::msg::{ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg, ReceiveMsg, StatusResponse};
use crate::state::{Config, CONFIG};

const CONTRACT_NAME: &str = "crates.io:coin-presale";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NATIVE_DENOM: &str = "uaxm";

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    if msg.rate_num == 0 || msg.rate_denom == 0 {
        return Err(ContractError::InvalidRate);
    }

    let config = Config {
        admin: info.sender,
        coin_cw20: deps.api.addr_validate(&msg.coin_cw20)?,
        rate_num: msg.rate_num,
        rate_denom: msg.rate_denom,
        enabled: msg.enabled,
        max_per_tx: msg.max_per_tx,
        total_axm_received: Uint128::zero(),
        total_coin_sold: Uint128::zero(),
    };

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", config.admin.to_string())
        .add_attribute("coin_cw20", config.coin_cw20.to_string())
        .add_attribute("rate", format!("{}/{}", config.rate_num, config.rate_denom))
        .add_attribute("enabled", config.enabled.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Buy {} => execute_buy(deps, env, info),
        ExecuteMsg::Receive(cw20_msg) => execute_receive(deps, info, cw20_msg),
        ExecuteMsg::UpdateConfig {
            rate_num,
            rate_denom,
            enabled,
            max_per_tx,
        } => execute_update_config(deps, info, rate_num, rate_denom, enabled, max_per_tx),
        ExecuteMsg::WithdrawAxm { amount } => execute_withdraw_axm(deps, env, info, amount),
        ExecuteMsg::WithdrawCoin { amount } => execute_withdraw_coin(deps, info, amount),
    }
}

/// User sends native uaxm → receives COIN (CW20) at the configured rate.
fn execute_buy(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if !config.enabled {
        return Err(ContractError::PresaleDisabled);
    }

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

    let axm_amount = sent.amount;

    // Check per-tx limit
    if !config.max_per_tx.is_zero() && axm_amount > config.max_per_tx {
        return Err(ContractError::ExceedsMaxPerTx {
            max: config.max_per_tx.to_string(),
        });
    }

    // Calculate COIN output: coin_micro = axm_micro * rate_num / rate_denom
    let coin_amount = axm_amount
        .checked_mul(Uint128::from(config.rate_num))?
        .checked_div(Uint128::from(config.rate_denom))?;

    if coin_amount.is_zero() {
        return Err(ContractError::ZeroOutput);
    }

    // Check pool has enough COIN — query CW20 balance of this contract
    let pool_balance: cw20::BalanceResponse = deps.querier.query_wasm_smart(
        config.coin_cw20.to_string(),
        &cw20::Cw20QueryMsg::Balance {
            address: env.contract.address.to_string(),
        },
    )?;

    if pool_balance.balance < coin_amount {
        return Err(ContractError::InsufficientPool {
            available: pool_balance.balance.to_string(),
            requested: coin_amount.to_string(),
        });
    }

    // Update stats
    config.total_axm_received += axm_amount;
    config.total_coin_sold += coin_amount;
    CONFIG.save(deps.storage, &config)?;

    // Send COIN (CW20 transfer) to buyer
    let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.coin_cw20.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount: coin_amount,
        })?,
        funds: vec![],
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "buy")
        .add_attribute("buyer", info.sender.to_string())
        .add_attribute("axm_paid", axm_amount.to_string())
        .add_attribute("coin_received", coin_amount.to_string()))
}

/// CW20 receive hook — fund the presale pool with COIN tokens.
fn execute_receive(
    deps: DepsMut,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only accept tokens from the configured COIN CW20 contract
    if info.sender != config.coin_cw20 {
        return Err(ContractError::Unauthorized);
    }

    // Decode sub-message (optional — any send to this contract funds the pool)
    let _msg: ReceiveMsg = cosmwasm_std::from_json(&cw20_msg.msg)?;

    Ok(Response::new()
        .add_attribute("action", "fund")
        .add_attribute("funder", cw20_msg.sender)
        .add_attribute("amount", cw20_msg.amount.to_string()))
}

/// Admin: update configuration.
fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    rate_num: Option<u64>,
    rate_denom: Option<u64>,
    enabled: Option<bool>,
    max_per_tx: Option<Uint128>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    if let Some(n) = rate_num {
        if n == 0 {
            return Err(ContractError::InvalidRate);
        }
        config.rate_num = n;
    }
    if let Some(d) = rate_denom {
        if d == 0 {
            return Err(ContractError::InvalidRate);
        }
        config.rate_denom = d;
    }
    if let Some(e) = enabled {
        config.enabled = e;
    }
    if let Some(m) = max_per_tx {
        config.max_per_tx = m;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "update_config")
        .add_attribute("rate", format!("{}/{}", config.rate_num, config.rate_denom))
        .add_attribute("enabled", config.enabled.to_string()))
}

/// Admin: withdraw accumulated native AXM.
fn execute_withdraw_axm(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    // Query actual native balance
    let balance = deps
        .querier
        .query_balance(env.contract.address.to_string(), NATIVE_DENOM)?;

    let withdraw_amount = if amount.is_zero() {
        balance.amount // 0 = withdraw all
    } else {
        amount
    };

    let send_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: NATIVE_DENOM.to_string(),
            amount: withdraw_amount,
        }],
    });

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "withdraw_axm")
        .add_attribute("amount", withdraw_amount.to_string()))
}

/// Admin: withdraw unsold COIN tokens.
fn execute_withdraw_coin(
    deps: DepsMut,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.coin_cw20.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount,
        })?,
        funds: vec![],
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "withdraw_coin")
        .add_attribute("amount", amount.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Status {} => to_json_binary(&query_status(deps, env)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
        coin_cw20: config.coin_cw20,
        rate_num: config.rate_num,
        rate_denom: config.rate_denom,
        enabled: config.enabled,
        max_per_tx: config.max_per_tx,
        total_axm_received: config.total_axm_received,
        total_coin_sold: config.total_coin_sold,
    })
}

fn query_status(deps: Deps, env: Env) -> StdResult<StatusResponse> {
    let config = CONFIG.load(deps.storage)?;

    // Query COIN CW20 balance
    let coin_balance: cw20::BalanceResponse = deps.querier.query_wasm_smart(
        config.coin_cw20.to_string(),
        &cw20::Cw20QueryMsg::Balance {
            address: env.contract.address.to_string(),
        },
    )?;

    // Query native AXM balance
    let axm_balance = deps
        .querier
        .query_balance(env.contract.address.to_string(), NATIVE_DENOM)?;

    Ok(StatusResponse {
        coin_available: coin_balance.balance,
        axm_balance: axm_balance.amount,
        rate_num: config.rate_num,
        rate_denom: config.rate_denom,
        enabled: config.enabled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, Addr, from_json};

    fn setup_contract(deps: DepsMut) {
        let msg = InstantiateMsg {
            coin_cw20: "coin_cw20_addr".to_string(),
            rate_num: 1,
            rate_denom: 1,
            enabled: true,
            max_per_tx: Uint128::zero(),
        };
        let info = mock_info("admin", &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn proper_instantiation() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.admin, Addr::unchecked("admin"));
        assert_eq!(config.coin_cw20, Addr::unchecked("coin_cw20_addr"));
        assert_eq!(config.rate_num, 1);
        assert_eq!(config.rate_denom, 1);
        assert!(config.enabled);
        assert_eq!(config.total_axm_received, Uint128::zero());
        assert_eq!(config.total_coin_sold, Uint128::zero());
    }

    #[test]
    fn instantiate_invalid_rate() {
        let mut deps = mock_dependencies();
        let msg = InstantiateMsg {
            coin_cw20: "coin_cw20_addr".to_string(),
            rate_num: 0,
            rate_denom: 1,
            enabled: true,
            max_per_tx: Uint128::zero(),
        };
        let info = mock_info("admin", &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(matches!(err, ContractError::InvalidRate));
    }

    #[test]
    fn buy_fails_when_disabled() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Disable
        let info = mock_info("admin", &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                rate_num: None,
                rate_denom: None,
                enabled: Some(false),
                max_per_tx: None,
            },
        )
        .unwrap();

        // Try to buy
        let info = mock_info("buyer", &coins(1_000_000, "uaxm"));
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Buy {}).unwrap_err();
        assert!(matches!(err, ContractError::PresaleDisabled));
    }

    #[test]
    fn buy_fails_no_funds() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("buyer", &[]);
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Buy {}).unwrap_err();
        assert!(matches!(err, ContractError::NoFundsSent));
    }

    #[test]
    fn buy_fails_wrong_denom() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("buyer", &coins(1_000_000, "uatom"));
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Buy {}).unwrap_err();
        assert!(matches!(err, ContractError::InvalidDenom { .. }));
    }

    #[test]
    fn buy_fails_exceeds_max_per_tx() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            coin_cw20: "coin_cw20_addr".to_string(),
            rate_num: 1,
            rate_denom: 1,
            enabled: true,
            max_per_tx: Uint128::new(500_000),
        };
        let info = mock_info("admin", &[]);
        instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let info = mock_info("buyer", &coins(1_000_000, "uaxm"));
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Buy {}).unwrap_err();
        assert!(matches!(err, ContractError::ExceedsMaxPerTx { .. }));
    }

    #[test]
    fn update_config_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                rate_num: Some(2),
                rate_denom: None,
                enabled: None,
                max_per_tx: None,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }

    #[test]
    fn update_config_works() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("admin", &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                rate_num: Some(2),
                rate_denom: Some(1),
                enabled: Some(false),
                max_per_tx: Some(Uint128::new(5_000_000)),
            },
        )
        .unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.rate_num, 2);
        assert_eq!(config.rate_denom, 1);
        assert!(!config.enabled);
        assert_eq!(config.max_per_tx, Uint128::new(5_000_000));
    }

    #[test]
    fn query_config_works() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config: ConfigResponse = from_json(res).unwrap();
        assert_eq!(config.admin, Addr::unchecked("admin"));
        assert_eq!(config.rate_num, 1);
        assert_eq!(config.rate_denom, 1);
        assert!(config.enabled);
    }

    #[test]
    fn withdraw_axm_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::WithdrawAxm {
                amount: Uint128::new(100),
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }

    #[test]
    fn withdraw_coin_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let info = mock_info("random_user", &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::WithdrawCoin {
                amount: Uint128::new(100),
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }
}
