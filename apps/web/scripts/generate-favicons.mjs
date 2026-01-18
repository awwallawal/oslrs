/**
 * Generate favicons from the Oyo State logo
 * Run with: node scripts/generate-favicons.mjs
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
const imagesDir = join(publicDir, 'images');

const sourceLogo = join(imagesDir, 'oyo-state-logo.png');

// Favicon sizes needed
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
  console.log('Generating favicons from:', sourceLogo);

  // First, extract just the coat of arms (left portion) for favicon
  // The logo is 342x100, coat of arms is roughly the left 100x100 portion
  const metadata = await sharp(sourceLogo).metadata();
  console.log('Source image:', metadata.width, 'x', metadata.height);

  // Extract the coat of arms portion (left side, square)
  const coatOfArms = sharp(sourceLogo)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(metadata.height, metadata.width),
      height: metadata.height
    });

  // Save extracted coat of arms
  await coatOfArms
    .clone()
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile(join(imagesDir, 'oyo-coat-of-arms.png'));
  console.log('Created: oyo-coat-of-arms.png');

  // Generate each favicon size
  for (const { name, size } of sizes) {
    await coatOfArms
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(join(publicDir, name));
    console.log(`Created: ${name} (${size}x${size})`);
  }

  // Create ICO file (use 32x32 as base)
  // Note: sharp doesn't support ICO directly, we'll use the PNG
  console.log('\nFavicon generation complete!');
  console.log('\nAdd to index.html <head>:');
  console.log(`
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  `.trim());
}

generateFavicons().catch(console.error);
