/**
 * Audit every express-rate-limit instance and report WHICH KEY it buckets on.
 *
 * Why this exists: per-IP limiting has turned real Nigerian users away four times
 * (registration 2026-08-05, activation 2026-09-07, password reset 2026-09-16, and the
 * login pair still open). CGNAT and Opera Mini put many people behind one address, so a
 * small per-IP budget is shared between strangers. Each fix so far swept only its own
 * endpoint, and the next one surfaced weeks later from a complaint.
 *
 *   pnpm tsx scripts/audit-rate-limit-keys.ts
 *
 * A per-IP limiter is not automatically wrong — a HIGH flood ceiling is exactly what an
 * IP key is for. What this catches is the other kind: a SMALL budget on an
 * unauthenticated route, which is a shared-proxy outage waiting for a cohort.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not import.meta.dirname: CI and the VPS run Node 20, where that property
// only exists from 20.11. The local Node here is 24 and would have hidden the gap (11-2).
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });
}

interface Limiter {
  name: string;
  max: string;
  windowMs: string;
  keyed: boolean;
  file: string;
}

const limiters: Limiter[] = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf-8');
  const re = /export const (\w+)\s*=\s*rateLimit\(\{([\s\S]*?)\n\}\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const [, name, body] = m;
    limiters.push({
      name,
      max: /\n\s*max:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? '?',
      windowMs: /\n\s*windowMs:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? '?',
      keyed: body.includes('keyGenerator'),
      file: file.replace(SRC, 'src'),
    });
  }
}

limiters.sort((a, b) => Number(a.keyed) - Number(b.keyed) || a.name.localeCompare(b.name));

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('LIMITER', 38)} ${pad('max', 22)} ${pad('window', 22)} KEY`);
console.log('-'.repeat(100));
for (const l of limiters) {
  console.log(
    `${pad(l.name, 38)} ${pad(l.max, 22)} ${pad(l.windowMs, 22)} ${l.keyed ? 'custom key' : '>>> PER-IP <<<'}`,
  );
}

const perIp = limiters.filter((l) => !l.keyed);
console.log(`\n${limiters.length} limiters; ${perIp.length} per-IP.`);
console.log(
  'Read every per-IP row: a HIGH ceiling is fine, a SMALL budget on a public route is not.',
);
