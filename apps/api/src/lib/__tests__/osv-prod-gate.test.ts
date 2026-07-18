import { describe, it, expect } from 'vitest';
import {
  buildProdClosure,
  computeProdBlockingFindings,
  computeDevOnlyFindings,
  type OsvScanJson,
} from '../osv-prod-gate.js';

describe('osv-prod-gate', () => {
  describe('buildProdClosure', () => {
    it('collects names and name@version from a nested pnpm-ls tree', () => {
      const ls = [
        {
          name: '@oslsr/api',
          dependencies: {
            express: {
              version: '4.19.2',
              dependencies: {
                'body-parser': { version: '1.20.2' },
              },
            },
            pg: { version: '8.11.5' },
          },
        },
      ];
      const closure = buildProdClosure(ls);
      expect(closure.has('express')).toBe(true);
      expect(closure.has('express@4.19.2')).toBe(true);
      expect(closure.has('body-parser@1.20.2')).toBe(true); // transitive
      expect(closure.has('pg@8.11.5')).toBe(true);
    });

    it('merges the prod closure across multiple workspace projects', () => {
      const ls = [
        { name: '@oslsr/api', dependencies: { drizzle: { version: '0.45.2' } } },
        { name: '@oslsr/web', dependencies: { react: { version: '18.3.1' } } },
      ];
      const closure = buildProdClosure(ls);
      expect(closure.has('drizzle@0.45.2')).toBe(true);
      expect(closure.has('react@18.3.1')).toBe(true);
    });

    it('traverses optionalDependencies too', () => {
      const ls = [{ dependencies: {}, optionalDependencies: { fsevents: { version: '2.3.3' } } }];
      expect(buildProdClosure(ls).has('fsevents@2.3.3')).toBe(true);
    });

    it('normalizes peer-suffixed versions to clean semver', () => {
      const ls = [{ dependencies: { postcss: { version: '8.5.9(peer)' } } }];
      const closure = buildProdClosure(ls);
      expect(closure.has('postcss@8.5.9')).toBe(true);
      expect(closure.has('postcss')).toBe(true);
    });

    it('handles a lone (non-array) project object defensively', () => {
      const closure = buildProdClosure({ dependencies: { pino: { version: '9.0.0' } } });
      expect(closure.has('pino@9.0.0')).toBe(true);
    });

    it('does not throw on empty / malformed input', () => {
      expect(buildProdClosure(undefined).size).toBe(0);
      expect(buildProdClosure([]).size).toBe(0);
      expect(buildProdClosure([{ dependencies: undefined }]).size).toBe(0);
    });
  });

  describe('computeProdBlockingFindings', () => {
    const osv: OsvScanJson = {
      results: [
        {
          packages: [
            // dev-only vulnerable pkg — absent from prod closure
            { package: { name: 'turbo', version: '1.13.0' }, vulnerabilities: [{ id: 'GHSA-3qcw-2rhx-2726' }] },
            // prod vulnerable pkg — exact version hit
            { package: { name: 'express', version: '4.19.2' }, vulnerabilities: [{ id: 'GHSA-prod-xxxx' }] },
            // pkg with no vulns — ignored
            { package: { name: 'pg', version: '8.11.5' }, vulnerabilities: [] },
          ],
        },
      ],
    };

    it('drops dev-only findings and keeps prod findings', () => {
      const closure = new Set(['express', 'express@4.19.2', 'pg', 'pg@8.11.5']);
      const blocking = computeProdBlockingFindings(osv, closure);
      expect(blocking.map((f) => f.name)).toEqual(['express']);
      expect(blocking[0].versionMismatch).toBe(false);
      expect(blocking[0].vulns).toContain('GHSA-prod-xxxx');
    });

    it('returns ZERO blocking findings when every vuln is dev-only (the 13-32 baseline)', () => {
      const devOnlyOsv: OsvScanJson = {
        results: [
          {
            packages: [
              'turbo', 'xlsx', 'flatted', 'postcss', 'esbuild', 'js-yaml',
              'markdown-it', 'linkify-it', 'ajv', 'phin', 'serialize-javascript', '@babel/core',
            ].map((name) => ({ package: { name, version: '1.0.0' }, vulnerabilities: [{ id: `GHSA-${name}` }] })),
          },
        ],
      };
      // prod closure contains none of the dev tooling
      const closure = new Set(['express', 'pg', 'drizzle-orm', 'exceljs']);
      expect(computeProdBlockingFindings(devOnlyOsv, closure)).toEqual([]);
    });

    it('BLOCKS fail-safe when the name is in prod but NO concrete version is known (bare name)', () => {
      const closure = new Set(['express']); // name present, no version key
      const blocking = computeProdBlockingFindings(osv, closure);
      const expr = blocking.find((f) => f.name === 'express');
      expect(expr).toBeDefined();
      expect(expr?.versionMismatch).toBe(true);
    });

    it('does NOT block a vuln whose name is in prod but at a DIFFERENT concrete version (dev-tree copy) — M1', () => {
      // prod ships postcss@8.5.10; the vuln is against postcss@7.0.0 (a dev copy).
      // Blocking on this would re-introduce the dev-tree noise the gate removes.
      const shared: OsvScanJson = {
        results: [{ packages: [
          { package: { name: 'postcss', version: '7.0.0' }, vulnerabilities: [{ id: 'GHSA-dev-copy' }] },
        ] }],
      };
      const closure = new Set(['postcss', 'postcss@8.5.10']);
      expect(computeProdBlockingFindings(shared, closure)).toEqual([]);
      // …but it stays VISIBLE (non-blocking) so we are not blind to it (AC2).
      expect(computeDevOnlyFindings(shared, closure).map((f) => f.name)).toEqual(['postcss']);
    });

    it('does not block a dev-only package that merely shares no name with prod', () => {
      const closure = new Set(['pg', 'pg@8.11.5']);
      // express not in closure → not blocked; turbo not in closure → not blocked
      expect(computeProdBlockingFindings(osv, closure)).toEqual([]);
    });

    it('handles missing results/packages without throwing', () => {
      expect(computeProdBlockingFindings({}, new Set())).toEqual([]);
      expect(computeProdBlockingFindings({ results: [] }, new Set())).toEqual([]);
      expect(computeProdBlockingFindings({ results: [{}] }, new Set())).toEqual([]);
    });
  });

  describe('computeDevOnlyFindings', () => {
    const osv: OsvScanJson = {
      results: [
        {
          packages: [
            { package: { name: 'turbo', version: '1.13.0' }, vulnerabilities: [{ id: 'GHSA-turbo' }] },
            { package: { name: 'express', version: '4.19.2' }, vulnerabilities: [{ id: 'GHSA-express' }] },
            { package: { name: 'pg', version: '8.11.5' }, vulnerabilities: [] },
          ],
        },
      ],
    };

    it('returns the complement of blocking — packages not in prod closure', () => {
      const closure = new Set(['express', 'express@4.19.2', 'pg']);
      const dev = computeDevOnlyFindings(osv, closure);
      expect(dev.map((f) => f.name)).toEqual(['turbo']); // express is prod → excluded
    });

    it('blocking + dev-only partition every vulnerable package exactly once', () => {
      const closure = new Set(['express', 'express@4.19.2']);
      const blocking = computeProdBlockingFindings(osv, closure).map((f) => f.name);
      const dev = computeDevOnlyFindings(osv, closure).map((f) => f.name);
      // union covers both vulnerable pkgs (pg has no vulns), no overlap
      expect(new Set([...blocking, ...dev])).toEqual(new Set(['express', 'turbo']));
      expect(blocking.filter((n) => dev.includes(n))).toEqual([]);
    });

    it('handles empty input', () => {
      expect(computeDevOnlyFindings({}, new Set())).toEqual([]);
    });
  });
});
