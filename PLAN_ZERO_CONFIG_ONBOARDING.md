# Plan for Zero-Config Developer Onboarding

**Goal:** Ensure any new developer can clone the repo and start working immediately without facing "missing .env", "missing dist", or "database connection" errors.

## Phase 1: Automation Scripts (The "Magic Button")

We will create a cross-platform Node.js script that handles the boring setup tasks automatically.

1.  **Create `scripts/setup-env.js`:**
    *   **Logic:**
        *   Check if root `.env` exists. If not, copy `.env.example`.
        *   Check if `apps/api/.env` exists. If not, copy root `.env` there.
        *   (Optional) Check if `apps/web/.env` exists. If not, copy root `.env` there.
    *   **Why:** Windows and Linux handle file copying differently (`cp` vs `copy`). Node.js `fs.copyFileSync` works perfectly on both.

2.  **Update Root `package.json`:**
    *   Add a `"setup"` script that chains these commands:
        1.  `pnpm install` (Install deps)
        2.  `node scripts/setup-env.js` (Fix env vars)
        3.  `docker compose up -d` (Start DB)
        4.  `pnpm build` (Generate dist files - still good practice for initial run)
        5.  `pnpm db:push` (Sync DB schema)
    *   **Result:** Developer runs `pnpm run setup` and walks away for 2 minutes. When they return, everything is green.

## Phase 2: Configuration Improvement (Better DX)

We will remove the friction of needing to "build" before touching the database.

1.  **Modify `apps/api/drizzle.config.ts`:**
    *   **Action:** Change `schema: './dist/db/schema/index.js'` to `schema: './src/db/schema/index.ts'`.
    *   **Why:** Drizzle Kit can read TypeScript directly using `tsx`. This means you can change a schema file and push it immediately without waiting for a compile step. This is a massive quality-of-life improvement.

2.  **Add `db:push` shortcut:**
    *   Add a script to root `package.json`: `"db:push": "pnpm --filter @oslsr/api drizzle-kit push"`.
    *   **Why:** Typing the full path is annoying. `pnpm db:push` is easy to remember.

## Phase 3: Documentation (The "Instruction Manual")

We will update the `README.md` to be the single source of truth.

1.  **Add "Quick Start" Section:**
    *   Top of the file.
    *   Instructions:
        1.  Clone repo.
        2.  Run `pnpm run setup`.
        3.  Run `pnpm dev`.
    *   (No long list of "copy this file", "run this command", "then run that".)

## Summary of Impact

| Current State | New State |
| :--- | :--- |
| Clone Repo | Clone Repo |
| `pnpm install` (Fails on network?) | `pnpm run setup` |
| `cp .env` (Manual) | (Automated) |
| `docker compose up` | (Automated) |
| `pnpm build` | (Automated) |
| `pnpm db:push` (Fails if no build) | (Automated & Config Fixed) |
| **Total Steps: 6+ (Error Prone)** | **Total Steps: 1 (Reliable)** |
