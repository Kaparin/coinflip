/**
 * Gas Granter Resolver — determines who pays gas for a user's transaction.
 *
 * - VIP users: treasury pays gas (granter = treasuryAddress)
 * - Non-VIP users: user pays gas from their own AXM balance (granter = userAddress)
 */

import { vipService } from '../services/vip.service.js';
import { env } from '../config/env.js';

export async function resolveGasGranter(userId: string, userAddress: string): Promise<string | undefined> {
  const vip = await vipService.getActiveVip(userId);
  if (vip) return env.TREASURY_ADDRESS || undefined; // VIP → treasury pays
  return userAddress;                                  // non-VIP → user pays
}
