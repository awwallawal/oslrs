/**
 * Trade vocabulary normaliser.
 *
 * Maps free-text trade names to canonical vocabulary. The seed table is a
 * conservative set of common Nigerian artisan trades; downstream curation
 * (super-admin review of [unmapped] flagged rows) extends it over time.
 *
 * Lookup is case-insensitive after trim + whitespace collapse. Inputs that
 * don't match are returned trimmed-but-otherwise-verbatim with an `[unmapped]`
 * warning so the back-fill report surfaces them for manual curation.
 *
 * Warning codes:
 *   - empty_input
 *   - [unmapped]   (no canonical match; raw value preserved)
 */

import type { NormaliseResult } from './types.js';

const TRADE_VOCABULARY: Record<string, string> = {
  // Plumbing
  plumber: 'Plumber',
  plumbing: 'Plumber',
  'plumbing services': 'Plumber',

  // Electrical
  electrician: 'Electrician',
  electrical: 'Electrician',
  'electrical services': 'Electrician',
  'electrical engineer': 'Electrician',

  // Carpentry
  carpenter: 'Carpenter',
  carpentry: 'Carpenter',
  woodwork: 'Carpenter',

  // Mason / bricklayer
  mason: 'Mason',
  masonry: 'Mason',
  bricklayer: 'Mason',
  bricklaying: 'Mason',
  'block layer': 'Mason',

  // Welder
  welder: 'Welder',
  welding: 'Welder',
  'iron worker': 'Welder',
  ironworker: 'Welder',

  // Mechanic
  mechanic: 'Mechanic',
  'auto mechanic': 'Mechanic',
  'car mechanic': 'Mechanic',
  'vehicle mechanic': 'Mechanic',

  // Tailor
  tailor: 'Tailor',
  tailoring: 'Tailor',
  fashion: 'Tailor',
  'fashion designer': 'Tailor',
  seamstress: 'Tailor',

  // Hair / beauty
  hairdresser: 'Hairdresser',
  'hair dresser': 'Hairdresser',
  hairdressing: 'Hairdresser',
  barber: 'Barber',
  barbing: 'Barber',
  'barbing salon': 'Barber',

  // Painter
  painter: 'Painter',
  painting: 'Painter',
  'house painter': 'Painter',

  // Driver
  driver: 'Driver',
  driving: 'Driver',
  chauffeur: 'Driver',

  // Tiling
  tiler: 'Tiler',
  tiling: 'Tiler',

  // POP / plasterer
  plasterer: 'Plasterer',
  plastering: 'Plasterer',
  pop: 'Plasterer',
};

export function normaliseTrade(input: unknown): NormaliseResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { value: '', warnings: ['empty_input'] };
  }

  const trimmed = input.trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const canonical = TRADE_VOCABULARY[key];

  if (canonical) {
    return { value: canonical, warnings: [] };
  }

  return { value: trimmed, warnings: ['[unmapped]'] };
}
