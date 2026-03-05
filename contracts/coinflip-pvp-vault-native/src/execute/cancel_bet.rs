use cosmwasm_std::{DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::state::{BetStatus, BETS, USER_OPEN_BET_COUNT, VAULT_BALANCES};

pub fn execute_cancel_bet(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    bet_id: u64,
) -> Result<Response, ContractError> {
    let mut bet = BETS.load(deps.storage, bet_id).map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // Only OPEN bets can be canceled
    if bet.status != BetStatus::Open {
        return Err(ContractError::InvalidStateTransition {
            action: "cancel".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // Only maker can cancel (server auto-cancels expired bets via authz as maker)
    if bet.maker != info.sender {
        return Err(ContractError::Unauthorized);
    }

    // Unlock funds back to maker
    let mut balance = VAULT_BALANCES.load(deps.storage, &bet.maker)?;
    balance.locked -= bet.amount;
    balance.available += bet.amount;
    VAULT_BALANCES.save(deps.storage, &bet.maker, &balance)?;

    // Decrement maker's open bets count
    let open_count = USER_OPEN_BET_COUNT
        .may_load(deps.storage, &bet.maker)?
        .unwrap_or(0);
    USER_OPEN_BET_COUNT.save(deps.storage, &bet.maker, &open_count.saturating_sub(1))?;

    // Update bet status
    bet.status = BetStatus::Canceled;
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_canceled")
        .add_attribute("bet_id", bet_id.to_string()))
}
