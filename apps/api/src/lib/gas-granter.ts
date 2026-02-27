/**
 * Gas Granter Resolver — determines who pays gas for a user's transaction.
 *
 * Returns undefined for all users — the relayer handles gas payment internally:
 * - If treasury→relayer feegrant exists on-chain, treasury pays gas
 * - Otherwise, relayer pays gas from its own balance
 *
 * Previously tried to force user/treasury as explicit granter, but this requires
 * on-chain feegrants that may not exist. The relayer fallback is more robust.
 */

export async function resolveGasGranter(_userId: string, _userAddress: string): Promise<string | undefined> {
  return undefined;
}
