use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Insufficient available balance: need {need}, have {have}")]
    InsufficientAvailableBalance { need: String, have: String },

    #[error("Bet not found: {id}")]
    BetNotFound { id: u64 },

    #[error("Invalid state transition: cannot {action} bet in {current_status} state")]
    InvalidStateTransition {
        action: String,
        current_status: String,
    },

    #[error("Too many open bets: max {max}")]
    TooManyOpenBets { max: u8 },

    #[error("Bet amount below minimum: {min}")]
    BetAmountBelowMinimum { min: String },

    #[error("Commitment mismatch: reveal does not match stored commitment")]
    CommitmentMismatch,

    #[error("Reveal timeout expired: deadline was {deadline}")]
    RevealTimeoutExpired { deadline: u64 },

    #[error("Reveal timeout not yet expired: deadline is {deadline}")]
    RevealNotYetExpired { deadline: u64 },

    #[error("Daily limit exceeded: max {max} per day")]
    DailyLimitExceeded { max: String },

    #[error("Self-accept not allowed")]
    SelfAcceptNotAllowed,

    #[error("Invalid CW20 token: expected {expected}")]
    InvalidToken { expected: String },
}
