/**
 * Story 13-74 AC1/AC2 — production-storage anti-write guard (pure logic).
 *
 * ── WHY THIS EXISTS, MEASURED ───────────────────────────────────────────────
 *
 * `auth.activation.test.ts` → "Activation with Selfie (S3 Integration)" gated
 * itself on `S3_ACCESS_KEY && S3_SECRET_KEY` and then built a real S3 client
 * from `process.env`. On a developer machine the root `.env` holds PRODUCTION
 * credentials for `oslsr-full-access` on `sfo3.digitaloceanspaces.com` — the
 * same DigitalOcean Spaces account that holds the backups. For roughly seven
 * months the test uploaded a generated selfie there on every run that happened
 * to have network, and deleted nothing: 1,624 objects / 58.33 MB, removed under
 * explicit authorisation on 2026-09-23.
 *
 * ⛔ THE GATE KEYED ON THE WRONG THING. Credentials being *present* says nothing
 * about WHICH bucket they open. The guard below keys on the TARGET instead.
 *
 * ── WHY IT REFUSES THE CONFIG RATHER THAN THROWING THE SUITE ────────────────
 *
 * `db-guard` (Story 9-62, the precedent AC1 names) THROWS, and that is right
 * there: the suite cannot run without a database, so a wrong DATABASE_URL must
 * stop everything. S3 is the opposite — the block already skips when S3 is not
 * configured, so the safe outcome is reachable without breaking anything.
 *
 * ⚠️ Verified before choosing: the root `.env` on the maintainer's machine sets
 * `S3_BUCKET_NAME=oslsr-full-access` with live keys. A throwing setup guard
 * would therefore red the ENTIRE API suite — including the pre-push gate — on
 * the very next push, for a test that is allowed to skip. Refusing the config
 * makes the production bucket unreachable to tests while the suite stays green,
 * which is the outcome the story actually wants.
 *
 * `assertTestS3Target` is still exported and still throws, for any caller that
 * must hard-fail, and it is what AC2's RED-verify drives.
 *
 * Pure: no import-time side effects, no `process.env` reads, no `dotenv`. The
 * caller passes the environment in. Same discipline as `db-guard`, and for the
 * same reason `vitest.setup.ts` uses `dotenv.parse` and not `dotenv.config()` —
 * a guard should KNOW one thing, never INJECT forty.
 */

/**
 * Buckets that are production, by name, regardless of endpoint.
 *
 * ⚠️ A deny-list is the BACKSTOP, not the primary rule — `looksLikeProductionS3Target`
 * also refuses any unrecognised bucket on a real remote object store. Naming the
 * known one keeps the refusal message concrete for the case that actually happened.
 */
export const PRODUCTION_S3_BUCKETS: readonly string[] = ['oslsr-full-access'];

/**
 * Host suffixes that mean "a real remote object store", i.e. somewhere a test
 * write costs money, persists, and may sit beside backups. `localhost`, MinIO
 * and any unrecognised host are NOT in this list and are treated as safe.
 */
export const REMOTE_OBJECT_STORE_HOSTS: readonly string[] = [
  'digitaloceanspaces.com',
  'amazonaws.com',
];

/**
 * True when the bucket name looks like a test bucket. Boundary-matched exactly
 * as `looksLikeTestDb` is, so `test-bucket`, `oslsr_test` and `bucket.test`
 * match while `latest`, `greatest` and `contest` do not.
 */
export function looksLikeTestBucket(bucketName: string): boolean {
  return /(^|[^a-z])test([^a-z]|$)/i.test(bucketName);
}

/** True when the endpoint points at a real remote object store. */
export function isRemoteObjectStore(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    // Unparseable endpoints are not treated as remote: the failure mode we are
    // guarding is a REAL bucket, and a string that is not a URL reaches none.
    return false;
  }
  return REMOTE_OBJECT_STORE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Would writing to this target touch production storage?
 *
 * Two independent reasons, either sufficient:
 *   1. the bucket is a known production bucket by name; or
 *   2. the endpoint is a real remote object store and the bucket does NOT look
 *      like a test bucket — the open-ended case, so a NEW prod bucket nobody
 *      added to the deny-list is still refused.
 */
export function looksLikeProductionS3Target(
  bucketName: string | undefined,
  endpoint: string | undefined,
): boolean {
  if (!bucketName) return false;
  if (PRODUCTION_S3_BUCKETS.includes(bucketName)) return true;
  if (isRemoteObjectStore(endpoint) && !looksLikeTestBucket(bucketName)) return true;
  return false;
}

export interface S3GuardEnv {
  bucketName: string | undefined;
  endpoint: string | undefined;
  accessKey: string | undefined;
  secretKey: string | undefined;
  /** Escape hatch, mirroring ALLOW_NONTEST_DB. Set ALLOW_PRODUCTION_S3=1. */
  allowProduction: boolean;
}

/**
 * Throws when a test would write to production storage. Names the bucket, per
 * AC2 — a guard whose message does not say WHAT it refused sends the reader
 * back to the env file to guess.
 */
export function assertTestS3Target(env: S3GuardEnv): void {
  if (env.allowProduction) return;
  if (!looksLikeProductionS3Target(env.bucketName, env.endpoint)) return;

  throw new Error(
    `[s3-guard] Refusing to run S3 integration tests against production bucket "${env.bucketName}"` +
      `${env.endpoint ? ` at ${env.endpoint}` : ''}.\n` +
      `This test uploads objects and that bucket shares an account with the backups; ` +
      `1,624 objects were left there over ~7 months before this guard existed.\n` +
      `Fix: point S3_BUCKET_NAME at a bucket whose name contains "test", or run a local MinIO.\n` +
      `If you REALLY intend to use "${env.bucketName}", set ALLOW_PRODUCTION_S3=1.`,
  );
}

/**
 * Why an S3 test block is or is not runnable.
 *
 * ⭐ `unconfigured` and `refused` are SEPARATE kinds on purpose: they were
 * indistinguishable before, which is why seven months of production writes
 * presented only as a skip-count wobble (8 ↔ 9) that read as noise.
 * (Groundwork for AC3, which also has to separate "endpoint unreachable".)
 */
export type TestS3Resolution =
  | { usable: true; bucketName: string; endpoint: string | undefined }
  | { usable: false; kind: 'unconfigured' | 'refused'; reason: string };

/**
 * The single place a test may obtain S3 settings. Returns an unusable result
 * — never throws — so a block can skip with a reason that says which kind of
 * skip it is.
 */
export function resolveTestS3Config(env: S3GuardEnv): TestS3Resolution {
  if (!env.accessKey || !env.secretKey) {
    return { usable: false, kind: 'unconfigured', reason: 'no S3 credentials configured' };
  }
  if (!env.bucketName) {
    return { usable: false, kind: 'unconfigured', reason: 'S3_BUCKET_NAME is not set' };
  }
  if (!env.allowProduction && looksLikeProductionS3Target(env.bucketName, env.endpoint)) {
    return {
      usable: false,
      kind: 'refused',
      reason:
        `refused by s3-guard: "${env.bucketName}" is a production bucket` +
        `${env.endpoint ? ` at ${env.endpoint}` : ''} — set S3_BUCKET_NAME to a test bucket, ` +
        `or ALLOW_PRODUCTION_S3=1 to override`,
    };
  }
  return { usable: true, bucketName: env.bucketName, endpoint: env.endpoint };
}

/** Read the guard's inputs off a process environment. Kept separate so the logic above stays pure. */
export function s3GuardEnvFrom(processEnv: NodeJS.ProcessEnv): S3GuardEnv {
  return {
    bucketName: processEnv.S3_BUCKET_NAME,
    endpoint: processEnv.S3_ENDPOINT,
    accessKey: processEnv.S3_ACCESS_KEY,
    secretKey: processEnv.S3_SECRET_KEY,
    allowProduction: processEnv.ALLOW_PRODUCTION_S3 === '1',
  };
}
