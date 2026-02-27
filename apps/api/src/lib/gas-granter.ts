/**
 * Gas Granter Resolver — determines who pays gas for a user's transaction.
 *
 * - VIP users: treasury pays gas explicitly (granter = treasuryAddress)
 * - Non-VIP users: no explicit granter — relayer falls back to treasury feegrant
 *   if available, otherwise relayer pays its own gas.
 */

import { vipService } from '../services/vip.service.js';
import { env } from '../config/env.js';

export async function resolveGasGranter(userId: string, _userAddress: string): Promise<string | undefined> {
  const vip = await vipService.getActiveVip(userId);
  if (vip) return env.TREASURY_ADDRESS || undefined; // VIP → treasury pays
  return undefined;                                    // non-VIP → relayer/treasury fallback
}
