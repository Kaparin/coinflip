use cosmwasm_std::{DivideByZeroError, OverflowError, StdError};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Overflow(#[from] OverflowError),

    #[error("{0}")]
    DivideByZero(#[from] DivideByZeroError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("No funds sent")]
    NoFundsSent,

    #[error("Zero amount")]
    ZeroAmount,

    #[error("Insufficient stake: have {have}, requested {requested}")]
    InsufficientStake { have: String, requested: String },

    #[error("No pending rewards to claim")]
    NoPendingRewards,

    #[error("Nothing staked — cannot distribute rewards")]
    NothingStaked,

    #[error("Invalid denom: expected uaxm, got {denom}")]
    InvalidDenom { denom: String },

    #[error("Multiple denoms sent — only uaxm accepted")]
    MultipleDenoms,

    #[error("Invalid CW20 token — only LAUNCH accepted")]
    InvalidCw20Token,
}
