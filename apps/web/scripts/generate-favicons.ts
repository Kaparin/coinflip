/**
 * Generates favicons from coin-token-logo.png.
 * Run: pnpm --filter @coinflip/web generate:favicons
 *
 * Output:
 * - src/app/icon.png: 32x32 (browser tabs, bookmarks)
 * - src/app/apple-icon.png: 180x180 (iOS home screen)
 * - src/app/favicon.ico: 32x32 ICO (legacy browser fallback)
 */

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../public/coin-token-logo.png');
const APP_DIR = join(__dirname, '../src/app');

const SIZES = [
  { name: 'icon.png', size: 32 },
  { name: 'apple-icon.png', size: 180 },
] as const;

/** Create a minimal ICO file from a 32x32 PNG buffer */
function createIco(pngBuffer: Buffer): Buffer {
  // ICO format: ICONDIR header + ICONDIRENTRY + PNG data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type: 1 = ICO
  header.writeUInt16LE(1, 4);      // Count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);         // Width (32, 0 means 256)
  entry.writeUInt8(32, 1);         // Height
  entry.writeUInt8(0, 2);          // Color palette
  entry.writeUInt8(0, 3);          // Reserved
  entry.writeUInt16LE(1, 4);       // Color planes
  entry.writeUInt16LE(32, 6);      // Bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);  // Image size
  entry.writeUInt32LE(22, 12);     // Offset (6 + 16 = 22)

  return Buffer.concat([header, entry, pngBuffer]);
}

async function main() {
  const img = sharp(SRC);
  const meta = await img.metadata();
  console.log(`Source: ${SRC} (${meta.width}x${meta.height})`);

  let icon32Buffer: Buffer | null = null;

  for (const { name, size } of SIZES) {
    const outPath = join(APP_DIR, name);
    const buf = await img
      .clone()
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(outPath, buf);
    console.log(`  → ${name} (${size}x${size})`);

    if (size === 32) icon32Buffer = buf;
  }

  // Generate favicon.ico from the 32x32 PNG
  if (icon32Buffer) {
    const icoPath = join(APP_DIR, 'favicon.ico');
    writeFileSync(icoPath, createIco(icon32Buffer));
    console.log(`  → favicon.ico (32x32 ICO)`);
  }

  console.log('Done. Next.js will auto-detect app/icon.png, app/apple-icon.png, and app/favicon.ico.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
