use cosmwasm_std::{DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::state::{BetStatus, BETS, CONFIG, USER_OPEN_BET_COUNT, VAULT_BALANCES};

pub fn execute_claim_timeout(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut bet = BETS.load(deps.storage, bet_id).map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // Only ACCEPTED bets can be timeout-claimed
    if bet.status != BetStatus::Accepted {
        return Err(ContractError::InvalidStateTransition {
            action: "claim_timeout".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // Only acceptor can claim timeout
    let acceptor = bet.acceptor.clone().unwrap();
    if info.sender != acceptor {
        return Err(ContractError::Unauthorized);
    }

    // Check timeout expired
    let accepted_at = bet.accepted_at_time.unwrap();
    let deadline = accepted_at + config.reveal_timeout_secs;
    if env.block.time.seconds() <= deadline {
        return Err(ContractError::RevealNotYetExpired { deadline });
    }

    // Acceptor wins by default
    let pot = bet.amount * Uint128::new(2);
    let commission = pot * Uint128::from(config.commission_bps) / Uint128::new(10_000);
    let payout = pot - commission;

    // Update balances
    let mut maker_bal = VAULT_BALANCES.load(deps.storage, &bet.maker)?;
    let mut acceptor_bal = VAULT_BALANCES.load(deps.storage, &acceptor)?;

    maker_bal.locked -= bet.amount;
    acceptor_bal.locked -= bet.amount;
    acceptor_bal.available += payout;

    VAULT_BALANCES.save(deps.storage, &bet.maker, &maker_bal)?;
    VAULT_BALANCES.save(deps.storage, &acceptor, &acceptor_bal)?;

    // Credit treasury
    let mut treasury_bal = VAULT_BALANCES
        .may_load(deps.storage, &config.treasury)?
        .unwrap_or_default();
    treasury_bal.available += commission;
    VAULT_BALANCES.save(deps.storage, &config.treasury, &treasury_bal)?;

    // Decrement maker's open bet count
    let open_count = USER_OPEN_BET_COUNT
        .may_load(deps.storage, &bet.maker)?
        .unwrap_or(0);
    USER_OPEN_BET_COUNT.save(deps.storage, &bet.maker, &open_count.saturating_sub(1))?;

    // Update bet
    bet.status = BetStatus::TimeoutClaimed;
    bet.resolved_at_height = Some(env.block.height);
    bet.payout_winner = Some(acceptor.clone());
    bet.commission_paid = commission;
    bet.payout_amount = payout;
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_timeout_claimed")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("winner", acceptor.to_string())
        .add_attribute("payout", payout.to_string())
        .add_attribute("action", "coinflip.commission_paid")
        .add_attribute("treasury", config.treasury.to_string())
        .add_attribute("commission", commission.to_string()))
}
