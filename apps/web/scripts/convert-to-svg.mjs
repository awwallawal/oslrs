/**
 * Convert PNG logo to SVG using potrace
 * Run with: node scripts/convert-to-svg.mjs
 */

import potrace from 'potrace';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(__dirname, '../public/images');

const sourceCoatOfArms = join(imagesDir, 'oyo-coat-of-arms.png');
const sourceLogo = join(imagesDir, 'oyo-state-logo.png');

async function traceImage(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    potrace.trace(inputPath, {
      color: 'auto',
      threshold: 128,
      ...options
    }, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

async function posterizeImage(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    potrace.posterize(inputPath, {
      steps: 4,
      fillStrategy: potrace.Potrace.FILL_MEAN,
      ...options
    }, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

async function convertToSvg() {
  console.log('Converting images to SVG...\n');

  // Convert coat of arms (posterize for color preservation)
  try {
    console.log('Processing coat of arms...');
    const coatSvg = await posterizeImage(sourceCoatOfArms, null, {
      steps: 6,
      threshold: 180
    });
    await writeFile(join(imagesDir, 'oyo-coat-of-arms.svg'), coatSvg);
    console.log('Created: oyo-coat-of-arms.svg');
  } catch (err) {
    console.error('Error with coat of arms:', err.message);
  }

  // Convert full logo
  try {
    console.log('Processing full logo...');
    const logoSvg = await posterizeImage(sourceLogo, null, {
      steps: 6,
      threshold: 180
    });
    await writeFile(join(imagesDir, 'oyo-state-logo.svg'), logoSvg);
    console.log('Created: oyo-state-logo.svg');
  } catch (err) {
    console.error('Error with full logo:', err.message);
  }

  console.log('\nSVG conversion complete!');
  console.log('\nNote: Auto-traced SVGs may not be perfect.');
  console.log('For production, consider getting official vector files from the Ministry.');
}

convertToSvg().catch(console.error);
