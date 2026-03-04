export type ChestLabel = 'none' | 'popular' | 'bestValue';

export type ChestTier = {
  tier: number;
  nameKey: string;
  axmPrice: number;
  coinAmount: number;
  image: string;
  label: ChestLabel;
};

/** Default tiers — overridden by server config when available */
export const CHEST_TIERS: ChestTier[] = [
  { tier: 1, nameKey: 'shop.chest.pouch', axmPrice: 10, coinAmount: 15, image: '/box1.png', label: 'none' },
  { tier: 2, nameKey: 'shop.chest.casket', axmPrice: 30, coinAmount: 50, image: '/box2.png', label: 'none' },
  { tier: 3, nameKey: 'shop.chest.chest', axmPrice: 75, coinAmount: 150, image: '/box3.png', label: 'none' },
  { tier: 4, nameKey: 'shop.chest.grand', axmPrice: 200, coinAmount: 500, image: '/box4.png', label: 'popular' },
  { tier: 5, nameKey: 'shop.chest.royal', axmPrice: 500, coinAmount: 1500, image: '/box5.png', label: 'bestValue' },
  { tier: 6, nameKey: 'shop.chest.legendary', axmPrice: 1500, coinAmount: 5000, image: '/box6.png', label: 'none' },
];

/** Merge server tier config (axmPrice, coinAmount) with local display config */
export function mergeTierConfig(
  serverTiers: Array<{ tier: number; axmPrice: number; coinAmount: number }>,
): ChestTier[] {
  return CHEST_TIERS.map((local) => {
    const server = serverTiers.find((s) => s.tier === local.tier);
    if (server) {
      return { ...local, axmPrice: server.axmPrice, coinAmount: server.coinAmount };
    }
    return local;
  });
}
