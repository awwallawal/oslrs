/**
 * Story 13-32 — osv-scanner PRODUCTION-scope gate (CLI).
 *
 * Reproduces the retired `pnpm audit --prod` deploy gate on top of osv-scanner
 * (which has no `--prod` mode and scans the whole lockfile). Keeps ONLY the
 * findings whose package is in pnpm's production dependency closure and fails
 * the build iff a PRODUCTION dependency is vulnerable.
 *
 * Usage (see .github/workflows/ci-cd.yml):
 *   pnpm ls -r --prod --depth Infinity --json > prod-ls.json
 *   osv-scanner scan --format json --lockfile pnpm-lock.yaml --output osv-full.json || true
 *   pnpm --filter @oslsr/api exec tsx scripts/osv-prod-gate.ts <repo>/prod-ls.json <repo>/osv-full.json
 *
 * Exit codes:
 *   0 — no production dependency is vulnerable (dev-tree findings are ignored
 *       here; they are surfaced non-blocking by the AC2 report-only SARIF pass).
 *   1 — at least one production dependency is vulnerable (BLOCK the deploy), or
 *       a usage/parse error.
 *
 * The gate logic lives in ../src/lib/osv-prod-gate.ts and is unit-tested by the
 * test-api CI job (apps/api/src/lib/__tests__/osv-prod-gate.test.ts).
 */
import { readFileSync } from 'node:fs';
import {
  buildProdClosure,
  computeProdBlockingFindings,
  computeDevOnlyFindings,
  type OsvScanJson,
} from '../src/lib/osv-prod-gate.js';

/** Parse JSON that may have trailing non-JSON noise (e.g. the osv-scanner-action
 *  container appends a "Exit code: N" line to stdout). Slice to the last JSON
 *  terminator — `}` for the osv object output OR `]` for the pnpm-ls array. */
function parseJsonLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (end === -1) throw new Error('input is not JSON');
    return JSON.parse(raw.slice(0, end + 1));
  }
}

function main(): void {
  const [prodLsPath, osvPath] = process.argv.slice(2);
  if (!prodLsPath || !osvPath) {
    console.error('usage: osv-prod-gate.ts <pnpm-ls-prod.json> <osv-scan.json>');
    process.exit(1);
  }

  // Read/parse failures are distinct from a real finding: a missing/partial
  // scan file (network blip reaching ghcr.io / the OSV DB, `docker run || true`
  // swallowing a scanner crash) must still BLOCK fail-safe, but say so clearly
  // rather than masquerading as a production vulnerability.
  let prodClosure: Set<string>;
  let osv: OsvScanJson;
  try {
    prodClosure = buildProdClosure(parseJsonLoose(readFileSync(prodLsPath, 'utf8')));
    osv = parseJsonLoose(readFileSync(osvPath, 'utf8')) as OsvScanJson;
  } catch (err) {
    console.error('❌ osv prod-gate: could not read/parse scan inputs — BLOCKING fail-safe (this is NOT a confirmed prod vuln).');
    console.error(`   ${(err as Error).message}`);
    console.error(`   Check that osv-scanner produced valid JSON at ${osvPath} and pnpm-ls at ${prodLsPath} (transient scanner/registry outage?).`);
    process.exit(1);
  }

  const blocking = computeProdBlockingFindings(osv, prodClosure);
  const devOnly = computeDevOnlyFindings(osv, prodClosure);

  console.log(`osv prod-scope gate: prod closure = ${prodClosure.size} keys`);

  // AC2 — keep dev-tree VISIBLE (non-blocking) so prod-scoping the gate does
  // not make us blind. The SARIF report-only pass (see ci-cd.yml) also uploads
  // these to the Security tab; here we surface them in the build log.
  if (devOnly.length > 0) {
    console.log(`ℹ️  ${devOnly.length} dev-tree finding(s) (report-only, NOT blocking):`);
    for (const f of devOnly) console.log(`   ${f.name}@${f.version} — ${f.vulns.join(', ')}`);
  }

  if (blocking.length === 0) {
    console.log('✅ No production dependency is vulnerable. Dev-tree findings (if any) are reported non-blocking via SARIF.');
    process.exit(0);
  }

  console.error(`❌ ${blocking.length} PRODUCTION dependency finding(s) block the deploy:`);
  for (const f of blocking) {
    const drift = f.versionMismatch ? ' (version drift — blocked fail-safe)' : '';
    console.error(`   ${f.name}@${f.version}${drift} — ${f.vulns.join(', ')}`);
  }
  console.error('\nRemediate at source (bounded override / dependency bump). See osv-scanner.toml header + package.json pnpm.comments.override-policy.');
  process.exit(1);
}

main();
