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
  axis: 'person' | 'ip' | 'ip (disguised)';
  file: string;
}

/**
 * Classify what a limiter actually BUCKETS ON - not whether it happens to define a
 * `keyGenerator`.
 *
 * 2026-09-16: the first version of this script asked only "is there a keyGenerator?".
 * `registrationStatusRateLimit` has one, and its entire body is
 * `(req) => req.ip ? ipKeyGenerator(req.ip) : 'unknown'` - a pure per-IP limiter
 * (10/IP/15min, public, unauthenticated) that the tool filed under "custom key".
 * A limiter that hand-rolls an IP key was INVISIBLE to the tool built to find
 * IP-keyed limiters. Caught by the BMAD PM agent reviewing this script's own output.
 *
 * The rule: a census must pin the BINDING, never the presence of a mechanism.
 */
function classify(body: string, source: string): Limiter['axis'] {
  const raw = /keyGenerator\s*:\s*([\s\S]*?)(?:\n\s{2}\w+\s*:|$)/.exec(body)?.[1];
  if (!raw) return 'ip';

  // A keyGenerator is often a NAMED helper (`keyGenerator: keyByUser`). Judging the call
  // site alone sees no person source in the token `keyByUser` and files a per-USER limiter
  // as per-IP - which this script did on its first fix attempt, wrongly flagging three
  // audit/operations limiters. Resolve the identifier to its definition before judging.
  let gen = raw;
  const named = /^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/.exec(raw);
  if (named) {
    // Plain indexOf, deliberately NOT a RegExp: the first attempt built the pattern in a
    // template literal, where `\s` is just `s` and `\b` is a backspace - so it compiled
    // fine, matched nothing, and silently kept misclassifying. No escaping, no failure mode.
    for (const kw of ['const ', 'function ']) {
      const i = source.indexOf(kw + named[1]);
      if (i !== -1) {
        gen = source.slice(i, i + 800);
        break;
      }
    }
  }

  // Does the key draw on something identifying a PERSON rather than a network path?
  return /(\bbody\b|\bparams\b|\bquery\b|\bemail\b|\btoken\b|\buserId\b|\bnin\b|\bsub\b|user\?\.|user\.)/.test(gen)
    ? 'person'
    : 'ip (disguised)';
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
      axis: classify(body, source),
      file: file.replace(SRC, 'src'),
    });
  }
}

const order = { person: 0, 'ip (disguised)': 1, ip: 2 } as const;
limiters.sort((a, b) => order[a.axis] - order[b.axis] || a.name.localeCompare(b.name));

const pad = (s: string, n: number) => s.padEnd(n);
const label = {
  person: 'person key',
  'ip (disguised)': '>>> PER-IP (via keyGenerator) <<<',
  ip: '>>> PER-IP <<<',
} as const;
console.log(`${pad('LIMITER', 38)} ${pad('max', 22)} ${pad('window', 22)} AXIS`);
console.log('-'.repeat(120));
for (const l of limiters) {
  console.log(`${pad(l.name, 38)} ${pad(l.max, 22)} ${pad(l.windowMs, 22)} ${label[l.axis]}`);
}

const perIp = limiters.filter((l) => l.axis !== 'person');
const disguised = limiters.filter((l) => l.axis === 'ip (disguised)');
console.log(
  `\n${limiters.length} limiters; ${perIp.length} bucket on IP ` +
    `(${disguised.length} of them via a hand-rolled keyGenerator).`,
);
console.log(
  'Read every IP row: a HIGH ceiling is fine, a SMALL budget on a public route is not.',
);
