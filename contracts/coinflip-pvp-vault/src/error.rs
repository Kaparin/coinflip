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
    TooManyOpenBets { max: u16 },

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

    #[error("Invalid commission: max {max_bps} bps")]
    InvalidCommission { max_bps: u16 },

    #[error("Invalid timeout: must be between {min} and {max} seconds")]
    InvalidTimeout { min: u64, max: u64 },

    #[error("Bet expired: bet {id} expired at timestamp {expired_at}")]
    BetExpired { id: u64, expired_at: u64 },

    #[error("Invalid commitment: must be exactly 32 bytes (SHA-256 hash), got {len}")]
    InvalidCommitmentLength { len: usize },
}
