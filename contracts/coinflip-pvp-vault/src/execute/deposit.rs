use cosmwasm_std::{from_json, DepsMut, Env, MessageInfo, Response};
use cw20::Cw20ReceiveMsg;

use crate::error::ContractError;
use crate::msg::ReceiveMsg;
use crate::state::{CONFIG, VAULT_BALANCES};

pub fn execute_receive(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    cw20_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Verify token is our expected CW20
    if info.sender != config.token_cw20 {
        return Err(ContractError::InvalidToken {
            expected: config.token_cw20.to_string(),
        });
    }

    let _msg: ReceiveMsg = from_json(&cw20_msg.msg)?;
    let depositor = deps.api.addr_validate(&cw20_msg.sender)?;
    let amount = cw20_msg.amount;

    // Update vault balance
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &depositor)?
        .unwrap_or_default();
    balance.available += amount;
    VAULT_BALANCES.save(deps.storage, &depositor, &balance)?;

    Ok(Response::new()
        .add_attribute("action", "deposit")
        .add_attribute("depositor", depositor.to_string())
        .add_attribute("amount", amount.to_string())
        .add_attribute("new_available", balance.available.to_string()))
}
