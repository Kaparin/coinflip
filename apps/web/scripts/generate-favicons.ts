/**
 * Generates favicon and apple-touch-icon from launch-token-logo.png.
 * Run: pnpm --filter @coinflip/web generate:favicons
 *
 * Output sizes (recommended by favicon standards):
 * - icon.png: 32x32 (browser tabs, bookmarks)
 * - apple-icon.png: 180x180 (iOS home screen)
 */

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../public/launch-token-logo.png');
const APP_DIR = join(__dirname, '../src/app');

const SIZES = [
  { name: 'icon.png', size: 32 },
  { name: 'apple-icon.png', size: 180 },
] as const;

async function main() {
  const img = sharp(SRC);
  const meta = await img.metadata();
  console.log(`Source: ${SRC} (${meta.width}x${meta.height})`);

  for (const { name, size } of SIZES) {
    const outPath = join(APP_DIR, name);
    await img
      .clone()
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`  → ${name} (${size}x${size})`);
  }

  console.log('Done. Next.js will auto-detect app/icon.png and app/apple-icon.png.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
