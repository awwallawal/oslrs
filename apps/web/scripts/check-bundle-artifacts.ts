/**
 * Story 9-45 AC#6 (F-003) — production bundle artifact gate.
 *
 * Run AFTER `vite build` (wired into the web `build` script via tsx). Scans the
 * real `dist/` for dev/localhost artifacts and exits non-zero on any violation,
 * so a regression (e.g. sourcemaps re-enabled, a hard-coded localhost origin)
 * fails the build. Pure scan logic is unit-tested in
 * `src/lib/__tests__/bundle-artifact-scan.test.ts`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scanBundle, type BundleEntry } from '../src/lib/bundle-artifact-scan.js';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const distDir = join(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  console.error(`[check-bundle] dist/ not found at ${distDir} — run "vite build" first.`);
  process.exit(1);
}

// Review L1 — include .html (inline scripts / sourceMappingURL / hard-coded
// origins can land in dist/index.html, which the previous .js/.css/.map-only
// filter skipped). .map filenames are still flagged by existence alone.
const scannable = walk(distDir).filter((f) => ['.js', '.mjs', '.css', '.map', '.html'].includes(extname(f)));
const entries: BundleEntry[] = scannable.map((file) => ({
  file,
  content: file.endsWith('.map') ? '' : readFileSync(file, 'utf-8'),
}));

const violations = scanBundle(entries);
if (violations.length > 0) {
  console.error('[check-bundle] FAILED — dev/localhost artifacts found in the production bundle:');
  for (const v of violations) console.error(`  - ${v.issue}: ${v.file}`);
  process.exit(1);
}
console.log(`[check-bundle] OK — scanned ${entries.length} files, no dev/localhost artifacts.`);
