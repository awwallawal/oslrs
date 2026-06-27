/**
 * Story 13-7 — Web-test IndexedDB polyfill.
 *
 * jsdom has no IndexedDB, so any web test that transitively touches it (e.g.
 * route-resolution rendering WizardPage → useWizardDraft → offline-db) threw a
 * NON-DETERMINISTIC `MissingAPIError: IndexedDB API missing` unhandled rejection
 * that randomly red-lit CI `test-web` and stalled deploys (it briefly blocked 13-1).
 *
 * This installs a fake IndexedDB GLOBALLY for the web suite. It is a WEB-ONLY setup
 * file — wired into apps/web/vitest.config.ts (appended to the base `test/setup.ts`),
 * never the shared base config (the api package has no fake-indexeddb dep).
 */
import 'fake-indexeddb/auto';
