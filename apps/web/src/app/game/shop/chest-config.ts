export type ChestLabel = 'none' | 'popular' | 'bestValue';

export type ChestTier = {
  tier: number;
  nameKey: string;
  axmPrice: number;
  image: string;
  label: ChestLabel;
};

export const CHEST_TIERS: ChestTier[] = [
  { tier: 1, nameKey: 'shop.chest.pouch', axmPrice: 10, image: '/box1.png', label: 'none' },
  { tier: 2, nameKey: 'shop.chest.casket', axmPrice: 30, image: '/box2.png', label: 'none' },
  { tier: 3, nameKey: 'shop.chest.chest', axmPrice: 75, image: '/box3.png', label: 'none' },
  { tier: 4, nameKey: 'shop.chest.grand', axmPrice: 200, image: '/box4.png', label: 'popular' },
  { tier: 5, nameKey: 'shop.chest.royal', axmPrice: 500, image: '/box5.png', label: 'bestValue' },
  { tier: 6, nameKey: 'shop.chest.legendary', axmPrice: 1500, image: '/box6.png', label: 'none' },
];
