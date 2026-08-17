/**
 * Shared ESLint flat config for the WORKSPACE PACKAGES (`packages/*`).
 *
 * ## Why this file exists (Story 13-59 code review, 2026-08-16)
 *
 * `pnpm lint` runs `turbo run lint`, which runs the `lint` script of every
 * workspace that HAS one. Only `apps/api` and `apps/web` had one. So
 * `packages/types`, `packages/utils`, `packages/config` and `packages/testing`
 * — 42 TypeScript files, including the shared contract both applications
 * import — were **never linted, by anything, ever**. Running eslint against
 * them by hand did not fail a rule; it failed to start:
 *
 *     ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
 *
 * A green `pnpm lint` therefore said nothing at all about the packages, and
 * said it convincingly. That is the same shape as the pitfall already on
 * record for `scripts/` being outside `tsconfig` — a directory quietly outside
 * the gate that everyone reads as inside it, which is worse than a directory
 * with no gate, because the report covers for it.
 *
 * It surfaced when this story added `packages/types/src/staff-artefacts.ts` —
 * the single source of truth for who is entitled to which artefact, imported by
 * the API service, the operator's SQL filter and the browser column alike. The
 * one file that most needed a linter was placed where no linter looks.
 *
 * ## Why ONE config and not four
 *
 * Because the story this came from spent three findings on hand-written copies
 * of a rule that should have had one home. Four near-identical configs would be
 * the same mistake in a new medium, and they would drift the same way: silently,
 * and only visibly once the rules disagree about something that matters.
 *
 * Each package's `lint` script points here with `--config`. Plugins resolve
 * relative to THIS file, so the dependencies live in the root `package.json` —
 * at the versions `apps/api` and `apps/web` already pin, so nothing new enters
 * the lockfile and the OSV gate's surface is unchanged.
 *
 * Rules are deliberately the `apps/api` set, minus its Express-specific
 * carve-outs. Divergence between an app and a package it imports should be a
 * decision someone makes, not a default nobody chose.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts', '**/__tests__/**'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  // Test files — Vitest globals, and the two relaxations the apps already make.
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  },
);
