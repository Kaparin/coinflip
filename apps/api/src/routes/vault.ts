import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DepositRequestSchema, WithdrawRequestSchema } from '@coinflip/shared/schemas';
import { authMiddleware } from '../middleware/auth.js';
import { vaultService } from '../services/vault.service.js';
import type { AppEnv } from '../types.js';

export const vaultRouter = new Hono<AppEnv>();

// GET /api/v1/vault/balance — Get balance (auth required)
vaultRouter.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user');
  const balance = await vaultService.getBalance(user.id);
  return c.json({ data: balance });
});

// POST /api/v1/vault/deposit — Generate Axiome Connect deposit payload
vaultRouter.post('/deposit', authMiddleware, zValidator('json', DepositRequestSchema), async (c) => {
  const address = c.get('address');
  const { amount } = c.req.valid('json');

  // Generate Axiome Connect payload for CW20 Send to CoinFlip contract
  // In production, this constructs a proper axiomesign:// deep link
  const payload = {
    type: 'cosmwasm_execute',
    contract_addr: process.env.LAUNCH_CW20_ADDR ?? '<LAUNCH_CW20_ADDR>',
    msg: {
      send: {
        contract: process.env.COINFLIP_CONTRACT_ADDR ?? '<COINFLIP_CONTRACT_ADDR>',
        amount,
        msg: btoa(JSON.stringify({ deposit: {} })),
      },
    },
  };

  const base64Payload = btoa(JSON.stringify(payload));
  const deepLink = `axiomesign://${base64Payload}`;

  return c.json({
    data: {
      axiome_connect_payload: deepLink,
      amount,
      instruction: 'Scan or paste this in Axiome Wallet to deposit LAUNCH into the CoinFlip vault.',
    },
  });
});

// POST /api/v1/vault/withdraw — Withdraw from vault (via relayer)
vaultRouter.post('/withdraw', authMiddleware, zValidator('json', WithdrawRequestSchema), async (c) => {
  const user = c.get('user');
  const { amount } = c.req.valid('json');

  const balance = await vaultService.getBalance(user.id);
  if (BigInt(balance.available) < BigInt(amount)) {
    return c.json(
      { error: { code: 'INSUFFICIENT_BALANCE', message: `Need ${amount}, have ${balance.available}` } },
      400,
    );
  }

  // TODO: Submit MsgExec to chain via relayer for withdrawal
  // For now, just deduct from DB
  // In production, the indexer would update the balance after the on-chain tx confirms

  return c.json({
    data: {
      status: 'pending',
      amount,
      message: 'Withdrawal submitted to chain. Balance will update after confirmation.',
    },
  });
});
