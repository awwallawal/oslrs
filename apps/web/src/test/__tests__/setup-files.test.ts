import { describe, it, expect, vi } from 'vitest';

/**
 * Story 13-7 — setupFiles concat guard.
 *
 * `apps/web/vitest.config.ts` APPENDS the web-only fake-indexeddb setup to baseConfig's
 * shared `test/setup.ts` via mergeConfig. If a future edit REPLACES setupFiles instead of
 * appending, one of the two silently drops — and the symptom (a missing IndexedDB polyfill
 * or a missing window.location mock) is a worse, harder-to-spot regression than the flake
 * this story fixed. This test fails loudly if EITHER setup stops loading.
 */
describe('web vitest setupFiles (Story 13-7 concat guard)', () => {
  it('loads the web fake-indexeddb polyfill — globalThis.indexedDB is defined', () => {
    expect(globalThis.indexedDB).toBeDefined();
  });

  it('STILL loads the shared base setup — window.location is mocked (proves APPEND, not REPLACE)', () => {
    expect(vi.isMockFunction(window.location.assign)).toBe(true);
  });
});
