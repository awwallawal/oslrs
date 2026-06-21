/**
 * Production bundle artifact scanner — Story 9-45 AC#6 (F-003).
 *
 * Pure scanning logic (unit-tested). The CI/build runner that reads the real
 * `dist/` lives in `apps/web/scripts/check-bundle-artifacts.ts` and imports this.
 *
 * Flags dev/localhost artifacts that must never ship to production:
 *   - source map files (`*.map`) or `//# sourceMappingURL=...map` references
 *   - hard-coded dev origins (localhost:5173 / :3000 / 127.0.0.1:<devport>)
 *
 * Matching is intentionally NARROW (project dev origins + map artifacts) so an
 * incidental "localhost" substring in a vendor chunk doesn't false-fail.
 */

export interface BundleEntry {
  file: string;
  content: string;
}

export interface BundleViolation {
  file: string;
  issue: string;
}

const DEV_ORIGIN_RE = /(localhost:(5173|3000)|127\.0\.0\.1:(5173|3000))/;
const SOURCEMAP_REF_RE = /sourceMappingURL=[^\s'"]+\.map/;

export function scanBundle(entries: BundleEntry[]): BundleViolation[] {
  const violations: BundleViolation[] = [];
  for (const { file, content } of entries) {
    if (file.endsWith('.map')) {
      violations.push({ file, issue: 'source map file shipped' });
      continue;
    }
    const text = content ?? '';
    if (SOURCEMAP_REF_RE.test(text)) {
      violations.push({ file, issue: 'sourceMappingURL reference' });
    }
    if (DEV_ORIGIN_RE.test(text)) {
      violations.push({ file, issue: 'hard-coded dev origin (localhost/127.0.0.1 dev port)' });
    }
  }
  return violations;
}
