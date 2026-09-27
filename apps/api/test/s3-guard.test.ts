import { describe, it, expect } from 'vitest';
import {
  assertTestS3Target,
  resolveTestS3Config,
  looksLikeProductionS3Target,
  looksLikeTestBucket,
  isRemoteObjectStore,
  s3GuardEnvFrom,
} from './s3-guard';

/**
 * Story 13-74 AC1/AC2 — production-storage anti-write guard.
 *
 * ⭐ AC2 asks for the RED-VERIFY THE WRONG WAY ROUND (§2ae): point the harness at
 * the production bucket ON PURPOSE and confirm it objects BY NAME. A guard that
 * stays silent when abused is a comment, and this class already defeated one
 * comment and a five-week sweep. The two "refuses the real thing" cases below use
 * the ACTUAL production values — `oslsr-full-access` on
 * `https://sfo3.digitaloceanspaces.com` — not a stand-in, because a stand-in
 * proves the regex and not the outcome.
 *
 * Imports the PURE module, so these assertions never depend on the ambient env.
 */
describe('production-storage anti-write guard (13-74 AC1/AC2)', () => {
  const PROD_BUCKET = 'oslsr-full-access';
  const PROD_ENDPOINT = 'https://sfo3.digitaloceanspaces.com';
  const creds = { accessKey: 'AKIA-test', secretKey: 'secret', allowProduction: false };

  describe('AC2 — it objects, by name, when pointed at production on purpose', () => {
    it('refuses the exact target that took 1,624 objects, and names the bucket', () => {
      expect(() =>
        assertTestS3Target({ ...creds, bucketName: PROD_BUCKET, endpoint: PROD_ENDPOINT }),
      ).toThrow(/Refusing to run S3 integration tests against production bucket "oslsr-full-access"/);
    });

    it('names the endpoint and the override in the same message', () => {
      let message = '';
      try {
        assertTestS3Target({ ...creds, bucketName: PROD_BUCKET, endpoint: PROD_ENDPOINT });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(PROD_ENDPOINT);
      expect(message).toContain('ALLOW_PRODUCTION_S3=1');
    });

    it('refuses an UNKNOWN bucket on a real remote store — the deny-list is a backstop, not the rule', () => {
      // A production bucket nobody has added to PRODUCTION_S3_BUCKETS yet.
      expect(() =>
        assertTestS3Target({ ...creds, bucketName: 'oslsr-new-prod', endpoint: PROD_ENDPOINT }),
      ).toThrow(/production bucket "oslsr-new-prod"/);
    });
  });

  describe('AC1 — safe targets are allowed, so the guard does not become something to disable', () => {
    it('allows a test-named bucket on the same remote store', () => {
      expect(() =>
        assertTestS3Target({ ...creds, bucketName: 'oslsr-test', endpoint: PROD_ENDPOINT }),
      ).not.toThrow();
    });

    it('allows local MinIO with any bucket name', () => {
      expect(() =>
        assertTestS3Target({ ...creds, bucketName: 'anything', endpoint: 'http://localhost:9000' }),
      ).not.toThrow();
    });

    it('honours the explicit override', () => {
      expect(() =>
        assertTestS3Target({
          ...creds,
          allowProduction: true,
          bucketName: PROD_BUCKET,
          endpoint: PROD_ENDPOINT,
        }),
      ).not.toThrow();
    });
  });

  describe('resolveTestS3Config — refuses the CONFIG so the suite stays green', () => {
    it('returns refused (not a throw) for the production target, with a reason naming the bucket', () => {
      const r = resolveTestS3Config({ ...creds, bucketName: PROD_BUCKET, endpoint: PROD_ENDPOINT });
      expect(r.usable).toBe(false);
      if (r.usable) throw new Error('unreachable');
      expect(r.kind).toBe('refused');
      expect(r.reason).toContain(PROD_BUCKET);
    });

    it('distinguishes "unconfigured" from "refused" — the wobble that hid this for 7 months', () => {
      const noCreds = resolveTestS3Config({
        bucketName: PROD_BUCKET,
        endpoint: PROD_ENDPOINT,
        accessKey: undefined,
        secretKey: undefined,
        allowProduction: false,
      });
      expect(noCreds.usable).toBe(false);
      if (noCreds.usable) throw new Error('unreachable');
      expect(noCreds.kind).toBe('unconfigured');

      const refused = resolveTestS3Config({ ...creds, bucketName: PROD_BUCKET, endpoint: PROD_ENDPOINT });
      if (refused.usable) throw new Error('unreachable');
      expect(refused.kind).not.toBe(noCreds.kind);
    });

    it('returns a usable config for a test bucket', () => {
      const r = resolveTestS3Config({ ...creds, bucketName: 'oslsr-test', endpoint: PROD_ENDPOINT });
      expect(r.usable).toBe(true);
      if (!r.usable) throw new Error('unreachable');
      expect(r.bucketName).toBe('oslsr-test');
    });

    it('reports a missing bucket name as unconfigured, not refused', () => {
      const r = resolveTestS3Config({ ...creds, bucketName: undefined, endpoint: PROD_ENDPOINT });
      if (r.usable) throw new Error('unreachable');
      expect(r.kind).toBe('unconfigured');
    });
  });

  describe('boundary behaviour', () => {
    it('does not false-positive on names merely containing t-e-s-t', () => {
      expect(looksLikeTestBucket('latest')).toBe(false);
      expect(looksLikeTestBucket('greatest')).toBe(false);
      expect(looksLikeTestBucket('contest-results')).toBe(false);
      expect(looksLikeTestBucket('oslsr-test')).toBe(true);
      expect(looksLikeTestBucket('test_bucket')).toBe(true);
    });

    it('treats subdomains of a remote store as remote, and unknown/unparseable hosts as not', () => {
      expect(isRemoteObjectStore('https://sfo3.digitaloceanspaces.com')).toBe(true);
      expect(isRemoteObjectStore('https://s3.us-east-1.amazonaws.com')).toBe(true);
      expect(isRemoteObjectStore('http://localhost:9000')).toBe(false);
      expect(isRemoteObjectStore('not-a-url')).toBe(false);
      expect(isRemoteObjectStore(undefined)).toBe(false);
    });

    it('⛔ does not refuse a host that merely ENDS WITH the suffix text but is a different domain', () => {
      // `notdigitaloceanspaces.com` must not match `digitaloceanspaces.com`.
      expect(isRemoteObjectStore('https://notdigitaloceanspaces.com')).toBe(false);
    });

    it('no bucket name at all is not a production target', () => {
      expect(looksLikeProductionS3Target(undefined, PROD_ENDPOINT)).toBe(false);
    });
  });

  describe('s3GuardEnvFrom', () => {
    it('reads the variable the activation test actually uses (S3_BUCKET_NAME, not S3_BUCKET)', () => {
      const env = s3GuardEnvFrom({
        S3_BUCKET_NAME: PROD_BUCKET,
        S3_ENDPOINT: PROD_ENDPOINT,
        S3_ACCESS_KEY: 'k',
        S3_SECRET_KEY: 's',
      } as NodeJS.ProcessEnv);
      expect(env.bucketName).toBe(PROD_BUCKET);
      expect(env.allowProduction).toBe(false);
    });

    it('only the exact string "1" enables the override', () => {
      expect(s3GuardEnvFrom({ ALLOW_PRODUCTION_S3: 'true' } as NodeJS.ProcessEnv).allowProduction).toBe(false);
      expect(s3GuardEnvFrom({ ALLOW_PRODUCTION_S3: '1' } as NodeJS.ProcessEnv).allowProduction).toBe(true);
    });
  });
});
