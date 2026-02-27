use cosmwasm_std::{OverflowError, DivideByZeroError, StdError};
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

    #[error("Presale is currently disabled")]
    PresaleDisabled,

    #[error("No AXM funds sent. Send native uaxm to buy COIN")]
    NoFundsSent,

    #[error("Send exactly one coin denomination (uaxm)")]
    MultipleDenoms,

    #[error("Invalid denom: expected uaxm, got {denom}")]
    InvalidDenom { denom: String },

    #[error("Insufficient COIN in presale pool. Available: {available}, requested: {requested}")]
    InsufficientPool {
        available: String,
        requested: String,
    },

    #[error("Computed COIN amount is zero — send more AXM")]
    ZeroOutput,

    #[error("Invalid rate: numerator and denominator must be > 0")]
    InvalidRate,

    #[error("Amount exceeds per-transaction limit of {max}")]
    ExceedsMaxPerTx { max: String },
}
