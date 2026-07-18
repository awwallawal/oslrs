/**
 * Story 13-32 — osv-scanner PRODUCTION-scope gate logic.
 *
 * Why this exists
 * ---------------
 * osv-scanner has no `--prod` equivalent: it scans the WHOLE pnpm-lock.yaml,
 * surfacing the dev/build/test-tooling subtree that the retired `pnpm audit
 * --prod` gate (410-Gone, Story 13-31) correctly excluded. Story 13-31 papered
 * over this with a per-CVE ignore list in `osv-scanner.toml` carrying an
 * `ignoreUntil = 2026-08-15` expiry cliff.
 *
 * This module removes the cliff at the ROOT CAUSE by reproducing the exact
 * `pnpm audit --prod` scope: it keeps ONLY the osv-scanner findings whose
 * package is in the production dependency closure (as resolved by pnpm itself
 * via `pnpm ls -r --prod --depth Infinity --json`) and drops everything else.
 * The deploy-blocking CI gate fails iff a PRODUCTION dependency is vulnerable —
 * matching the team's signed-off posture (no high/critical in *prod* deps) — no
 * per-CVE ignores, no expiry.
 *
 * The prod closure is derived from pnpm's own `--prod` resolution, so the
 * scanned set equals the real prod set BY CONSTRUCTION (AC1 cross-check).
 *
 * A full-lockfile report-only pass (Story 13-32 AC2) preserves dev-tree
 * visibility via SARIF → GitHub Security tab; this gate is only the BLOCKING
 * tier.
 */

/** Shape of a single package entry in `osv-scanner --format json` output. */
export interface OsvPackageResult {
  package?: { name?: string; version?: string };
  vulnerabilities?: Array<{ id?: string }>;
}

/** Shape of `osv-scanner --format json` output (only the fields we consume). */
export interface OsvScanJson {
  results?: Array<{ packages?: OsvPackageResult[] }>;
}

/** A single pnpm-ls dependency node (recursive). */
interface PnpmLsDepNode {
  version?: string;
  dependencies?: Record<string, PnpmLsDepNode>;
  optionalDependencies?: Record<string, PnpmLsDepNode>;
}

/** A pnpm-ls project entry (one per workspace package). */
interface PnpmLsProject {
  dependencies?: Record<string, PnpmLsDepNode>;
  optionalDependencies?: Record<string, PnpmLsDepNode>;
}

export interface ProdBlockingFinding {
  name: string;
  version: string;
  vulns: string[];
  /** True when the package name is in the prod closure but the closure carries
   *  NO concrete version for it (rare) — we cannot prove the flagged version is
   *  a dev-tree copy, so we block fail-safe. See {@link computeProdBlockingFindings}. */
  versionMismatch: boolean;
}

/**
 * The subset of closure names for which we know at least one CONCRETE prod
 * version (i.e. a `name@version` entry exists, not just a bare `name`). Handles
 * scoped names: the version delimiter is the LAST `@`, so `@babel/core@7.29.6`
 * → name `@babel/core` (versioned) while a bare `@babel/core` (lastIndexOf('@')
 * === 0) is not.
 */
function namesWithKnownVersion(prodClosure: Set<string>): Set<string> {
  const names = new Set<string>();
  for (const entry of prodClosure) {
    const at = entry.lastIndexOf('@');
    if (at > 0) names.add(entry.slice(0, at));
  }
  return names;
}

/**
 * Normalize a pnpm version string. pnpm sometimes suffixes resolved versions
 * with peer-dep context, e.g. `8.5.9(peer)` or `1.2.3_react@18`. osv-scanner
 * reports clean semver, so strip anything past the first space, `(`, or `_`.
 */
function normalizeVersion(v: string | undefined): string {
  if (!v) return '';
  return v.split(/[\s(_]/)[0];
}

/**
 * Walk a pnpm-ls JSON tree (from `pnpm ls -r --prod --depth Infinity --json`)
 * and collect the production dependency closure. Returns a Set containing both
 * bare names (`"postcss"`) and `name@version` (`"postcss@8.5.9"`) keys.
 *
 * Accepts the parsed JSON which pnpm emits as an array of project objects (or,
 * for a single project, a lone object — handled defensively).
 */
export function buildProdClosure(pnpmLsJson: unknown): Set<string> {
  const closure = new Set<string>();

  const walk = (deps: Record<string, PnpmLsDepNode> | undefined): void => {
    if (!deps) return;
    for (const [name, node] of Object.entries(deps)) {
      const version = normalizeVersion(node?.version);
      closure.add(name);
      if (version) closure.add(`${name}@${version}`);
      walk(node?.dependencies);
      walk(node?.optionalDependencies);
    }
  };

  const projects: PnpmLsProject[] = Array.isArray(pnpmLsJson)
    ? (pnpmLsJson as PnpmLsProject[])
    : [pnpmLsJson as PnpmLsProject];

  for (const project of projects) {
    if (!project || typeof project !== 'object') continue;
    walk(project.dependencies);
    walk(project.optionalDependencies);
  }

  return closure;
}

/**
 * Given the full-lockfile osv-scanner JSON and a production closure, return the
 * findings that fall inside the production surface — i.e. the ones that MUST
 * block the deploy.
 *
 * Matching rules (reproduce `pnpm audit --prod`: block iff the *prod* tree
 * ships the vulnerable version — fail-safe only where prod's version is unknown,
 * never under-block):
 *   - `name@version` in the closure                → BLOCK (exact prod hit)
 *   - `name` in closure, prod ships a DIFFERENT     → SKIP (the vuln is against a
 *     concrete version (`name@x` exists, x≠flagged)   dev-tree copy; prod is not
 *                                                      exposed — surfaced
 *                                                      non-blocking by
 *                                                      {@link computeDevOnlyFindings}).
 *   - `name` in closure but NO concrete version     → BLOCK (versionMismatch=true);
 *     known (bare name only, rare)                    we cannot rule out a prod
 *                                                      exposure, so block fail-safe.
 *   - `name` not in the closure at all              → SKIP (genuinely dev-only)
 *
 * The earlier revision blocked *every* name-in-prod-version-differs case, which
 * re-introduced dev-tree noise: a dev-only CVE on any package that also lives in
 * prod at a safe version would red the gate — the exact class this gate exists
 * to remove (Story 13-32 review M1).
 */
export function computeProdBlockingFindings(
  osv: OsvScanJson,
  prodClosure: Set<string>,
): ProdBlockingFinding[] {
  const blocking: ProdBlockingFinding[] = [];
  const knownVersioned = namesWithKnownVersion(prodClosure);

  for (const result of osv.results ?? []) {
    for (const pkg of result.packages ?? []) {
      const vulns = (pkg.vulnerabilities ?? [])
        .map((v) => v.id)
        .filter((id): id is string => Boolean(id));
      if (vulns.length === 0) continue;

      const name = pkg.package?.name;
      if (!name) continue;
      const version = normalizeVersion(pkg.package?.version);

      const exact = version ? prodClosure.has(`${name}@${version}`) : false;

      if (exact) {
        blocking.push({ name, version, vulns, versionMismatch: false });
      } else if (prodClosure.has(name) && !knownVersioned.has(name)) {
        // Prod ships this name but the closure carries no concrete version for
        // it — we cannot prove the flagged version is a dev copy, so block
        // fail-safe rather than risk a format-drift false-negative.
        blocking.push({ name, version, vulns, versionMismatch: true });
      }
      // else: name absent from prod, OR prod ships a DIFFERENT concrete version
      // (dev-tree copy) → not a prod exposure → skip (reported non-blocking).
    }
  }

  return blocking;
}

/**
 * Clean complement of {@link computeProdBlockingFindings}: the vulnerable
 * packages the blocking gate ignores — either the name is NOT in the production
 * closure at all, OR prod ships a DIFFERENT concrete version (so the flagged
 * version is a dev-tree copy). Surfaced (non-blocking) in CI logs so prod-scoping
 * the gate does not make us blind to a compromised build tool (Story 13-32 AC2).
 *
 * The only vulnerable package this does NOT report is the fail-safe "name in
 * prod, version unknown" case — that one blocks, so it is not dev-only. Together
 * the two functions partition every vulnerable package exactly once.
 */
export function computeDevOnlyFindings(
  osv: OsvScanJson,
  prodClosure: Set<string>,
): Array<{ name: string; version: string; vulns: string[] }> {
  const devOnly: Array<{ name: string; version: string; vulns: string[] }> = [];
  const knownVersioned = namesWithKnownVersion(prodClosure);

  for (const result of osv.results ?? []) {
    for (const pkg of result.packages ?? []) {
      const vulns = (pkg.vulnerabilities ?? [])
        .map((v) => v.id)
        .filter((id): id is string => Boolean(id));
      if (vulns.length === 0) continue;

      const name = pkg.package?.name;
      if (!name) continue;
      const version = normalizeVersion(pkg.package?.version);

      const exact = version ? prodClosure.has(`${name}@${version}`) : false;
      if (exact) continue; // exact prod hit → blocking, not dev-only.

      // Dev-only when the name is absent from prod, OR prod ships a different
      // concrete version (dev-tree copy). Exclude the ambiguous bare-name case
      // (that one blocks) to keep the two sets a clean partition.
      if (!prodClosure.has(name) || knownVersioned.has(name)) {
        devOnly.push({ name, version, vulns });
      }
    }
  }

  return devOnly;
}
