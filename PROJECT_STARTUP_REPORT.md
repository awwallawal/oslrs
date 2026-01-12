# Project Startup & Troubleshooting Report
**Date:** 2026-01-12
**Author:** Amelia (Dev Agent)

## 1. Executive Summary
The project failed to start on the new machine primarily because **local configuration files (.env) and build artifacts (dist/) are excluded from version control**. This is standard security practice, but it blocked startup because the onboarding process was manual.

## 2. The Issues & Resolutions (What we fixed today)

### Issue A: Missing Dependencies
*   **Symptom:** `pnpm install` failing with `ECONNRESET`.
*   **Cause:** Unstable local network connection to the npm registry.
*   **Resolution:** Retried installation multiple times until the package cache was populated.

### Issue B: Missing Environment Variables (`DATABASE_URL`)
*   **Symptom:** `Error: DATABASE_URL is not set` when running `apps/api`.
*   **Cause:** The `apps/api` workspace did not have its own `.env` file, and the root `.env` is ignored by Git.
*   **Resolution:** Copied the root `.env` to the API directory.

### Issue C: Database Schema Sync Failure
*   **Symptom:** `drizzle-kit push` failing due to missing schema files.
*   **Cause:** `drizzle.config.ts` pointed to `./dist/...` (compiled JS). On a fresh clone, the `dist` folder does not exist until a build is run.
*   **Resolution:** Ran `pnpm build` to generate artifacts, then pushed the schema.

---

## 3. Root Cause Analysis ("Why it worked on the old laptop but not this one")
Your old system had "accumulated state" that a fresh clone lacks:
1.  **Persistent Config:** You created `.env` files months ago and forgot they aren't in Git.
2.  **Build Artifacts:** You ran `pnpm build` in the past, so `dist/` folders existed.
3.  **Active Database:** Your old local DB already had the tables created.

**Fresh Clone Reality:**
*   No `.env` files (Security).
*   No `node_modules` (Standard).
*   No `dist/` folders (Standard).
*   Empty Docker Database.

---

## 4. Permanent Fix Implementation Plan (Detailed Recommendations)

To prevent this difficulty in the future and make the project "Clone & Go", implement the following changes:

### A. Create an Automated Setup Script
Add a `setup` script to the **root** `package.json`. This automates the manual steps we took today.

**Modify `package.json`:**
```json
"scripts": {
  "setup": "pnpm install && pnpm run copy-env && pnpm build && pnpm db:push",
  "copy-env": "node scripts/copy-env.js",
  "db:push": "pnpm --filter @oslsr/api db:push"
}
```

**Create a helper script `scripts/copy-env.js`** (Cross-platform support for Windows/Mac/Linux):
```javascript
const fs = require('fs');
const path = require('path');

const rootEnv = path.join(__dirname, '..', '.env');
const apiEnv = path.join(__dirname, '..', 'apps', 'api', '.env');
const exampleEnv = path.join(__dirname, '..', '.env.example');

// 1. Create root .env if missing
if (!fs.existsSync(rootEnv) && fs.existsSync(exampleEnv)) {
  fs.copyFileSync(exampleEnv, rootEnv);
  console.log('Created .env from .env.example');
}

// 2. Copy root .env to apps/api/.env
if (fs.existsSync(rootEnv)) {
  fs.copyFileSync(rootEnv, apiEnv);
  console.log('Copied .env to apps/api/.env');
}
```

### B. Optimize Drizzle Configuration for Development
Currently, `drizzle.config.ts` relies on `dist` files, which forces you to run `pnpm build` before you can touch the database. This is bad Developer Experience (DX).

**Update `apps/api/drizzle.config.ts`:**
Change the `schema` path to point to the TypeScript source. Drizzle Kit supports TS files natively if `tsx` is installed (which it is).

```typescript
import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  // CHANGE THIS LINE: Point to src, not dist
  schema: './src/db/schema/index.ts', 
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### C. Update Documentation (README.md)
Add a clear "Getting Started" section so the next developer knows exactly what to do.

**Add to `README.md`:**

```markdown
## 🚀 Getting Started (Fresh Install)

Prerequisites: Node.js 20+, Docker Desktop.

1. **Clone & Setup:**
   ```bash
   git clone <repo-url>
   cd oslrs-main
   # Installs deps, copies .env, builds packages, pushes DB schema
   pnpm run setup
   ```

2. **Start Infrastructure:**
   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

3. **Start Development Server:**
   ```bash
   pnpm dev
   ```
```

### D. Summary of Benefits
1.  **One Command:** `pnpm run setup` handles everything.
2.  **Cross-Platform:** Works on your Windows laptop and Linux servers.
3.  **No Build Required for DB:** changing Drizzle config means you can edit a schema file and immediately push it without a full build.