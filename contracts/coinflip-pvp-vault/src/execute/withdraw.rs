use cosmwasm_std::{to_json_binary, CosmosMsg, DepsMut, Env, MessageInfo, Response, Uint128, WasmMsg};
use cw20::Cw20ExecuteMsg;

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

pub fn execute_withdraw(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &info.sender)?
        .unwrap_or_default();

    if balance.available < amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: amount.to_string(),
            have: balance.available.to_string(),
        });
    }

    balance.available -= amount;
    VAULT_BALANCES.save(deps.storage, &info.sender, &balance)?;

    // Send CW20 tokens back to user
    let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.token_cw20.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount,
        })?,
        funds: vec![],
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "withdraw")
        .add_attribute("user", info.sender.to_string())
        .add_attribute("amount", amount.to_string())
        .add_attribute("new_available", balance.available.to_string()))
}
