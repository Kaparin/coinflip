import { z } from 'zod';
import 'zod-openapi/extend';
import { AmountSchema } from './common.js';

// ---- Deposit ----
export const DepositRequestSchema = z
  .object({
    amount: AmountSchema.openapi({ description: 'Amount of LAUNCH to deposit', example: '500' }),
  })
  .openapi({ ref: 'DepositRequest' });

// ---- Withdraw ----
export const WithdrawRequestSchema = z
  .object({
    amount: AmountSchema.openapi({ description: 'Amount of LAUNCH to withdraw', example: '200' }),
  })
  .openapi({ ref: 'WithdrawRequest' });

// ---- Vault balance response ----
export const VaultBalanceResponseSchema = z
  .object({
    available: AmountSchema.openapi({ description: 'Available balance (not locked)', example: '1500' }),
    locked: AmountSchema.openapi({ description: 'Locked in active bets', example: '300' }),
    total: AmountSchema.openapi({ description: 'Total vault balance', example: '1800' }),
  })
  .openapi({ ref: 'VaultBalance' });
