use cosmwasm_std::{DepsMut, Env, MessageInfo, Response};
use cw_utils::must_pay;

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

pub fn execute_deposit(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Verify exactly one native coin of the accepted denom was sent
    let amount = must_pay(&info, &config.accepted_denom)?;

    let depositor = info.sender;

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
