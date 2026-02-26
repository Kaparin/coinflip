use cosmwasm_std::{Binary, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::state::{Bet, BetStatus, BETS, CONFIG, NEXT_BET_ID, USER_OPEN_BET_COUNT, VAULT_BALANCES};

pub fn execute_create_bet(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
    commitment: Binary,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Commitment must be exactly 32 bytes (SHA-256 output)
    if commitment.len() != 32 {
        return Err(ContractError::InvalidCommitmentLength {
            len: commitment.len(),
        });
    }

    // Check min bet
    if amount < config.min_bet {
        return Err(ContractError::BetAmountBelowMinimum {
            min: config.min_bet.to_string(),
        });
    }

    // Check available balance
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &info.sender)?
        .unwrap_or_default();
    if balance.available < amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: amount.to_string(),
            have: balance.available.to_string(),
        });
    }

    // Check open bets count
    let open_count = USER_OPEN_BET_COUNT
        .may_load(deps.storage, &info.sender)?
        .unwrap_or(0);
    if open_count >= config.max_open_per_user {
        return Err(ContractError::TooManyOpenBets {
            max: config.max_open_per_user,
        });
    }

    // Lock funds
    balance.available -= amount;
    balance.locked += amount;
    VAULT_BALANCES.save(deps.storage, &info.sender, &balance)?;

    // Increment open bets count
    USER_OPEN_BET_COUNT.save(deps.storage, &info.sender, &(open_count + 1))?;

    // Create bet
    let bet_id = NEXT_BET_ID.load(deps.storage)?;
    NEXT_BET_ID.save(deps.storage, &(bet_id + 1))?;

    let bet = Bet {
        id: bet_id,
        maker: info.sender.clone(),
        amount,
        commitment,
        status: BetStatus::Open,
        created_at_height: env.block.height,
        created_at_time: env.block.time.seconds(),
        acceptor: None,
        acceptor_guess: None,
        accepted_at_height: None,
        accepted_at_time: None,
        reveal_secret: None,
        reveal_side: None,
        resolved_at_height: None,
        payout_winner: None,
        commission_paid: Uint128::zero(),
        payout_amount: Uint128::zero(),
    };

    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_created")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("maker", info.sender.to_string())
        .add_attribute("amount", amount.to_string()))
}
