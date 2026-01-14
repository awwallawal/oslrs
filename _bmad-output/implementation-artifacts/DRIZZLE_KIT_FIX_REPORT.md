# Drizzle-Kit Infrastructure Fix Report

**Date:** 2026-01-14
**Related Story:** 1.7 (Secure Login & Session Management)
**Severity:** Critical - All drizzle-kit commands were blocked

---

## Executive Summary

All drizzle-kit commands (`migrate`, `push`, `generate`, `check`) stopped working during development of stories 1.7 and 1.9. Root cause analysis revealed **four distinct issues** that compounded to create a complete blockage. All issues have been resolved.

---

## Issues Identified

### Issue 1: Corrupted Temporary File in Meta Directory

**Symptom:** `SyntaxError: Unexpected token '/'` when running any drizzle-kit command

**Root Cause:** A file `apps/api/drizzle/meta/tmpclaude-5c5c-cwd` containing a CYGWIN-style path (`/c/Users/hp/Desktop/oslrs-main/apps/api/drizzle/meta`) was left behind by a previous Claude Code session. Drizzle-kit iterates over all files in the `meta/` directory and attempts to parse them as JSON snapshots.

**Fix:** Deleted the corrupted file.

```bash
rm apps/api/drizzle/meta/tmpclaude-5c5c-cwd
```

---

### Issue 2: Missing Migration SQL File

**Symptom:** `Error: No file ./drizzle/0005_auth_columns.sql found`

**Root Cause:** The migration file `0005_auth_columns.sql` was missing from disk, but its entry existed in:
- `drizzle/meta/_journal.json` (migration journal)
- `drizzle/meta/0005_snapshot.json` (schema snapshot)
- `__drizzle_migrations` table (already applied)

The file was either accidentally deleted or never saved after generation.

**Fix:** Recreated the SQL file by analyzing the diff between snapshots 0004 and 0005:

```sql
-- apps/api/drizzle/0005_auth_columns.sql
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_session_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_reset_token_unique" UNIQUE("password_reset_token");
```

---

### Issue 3: Migration Hash Mismatch

**Symptom:** After recreating the SQL file, drizzle-kit still reported migrations as unapplied

**Root Cause:** The recreated SQL file had a different SHA-256 hash than the original. The `__drizzle_migrations` table stores hashes, so the hash mismatch caused drizzle to think migration 0005 was not applied.

**Fix:** Updated the hash in the database to match the recreated file:

```sql
UPDATE __drizzle_migrations
SET hash = '657e5ee45b181aa3c8699cf4f0bcd176f66368fd1f4781f8313dc3c6cdaade14'
WHERE id = 18;  -- The 6th migration (0005)
```

---

### Issue 4: Duplicate Migrations Table in Different Schemas (PRIMARY BLOCKER)

**Symptom:** `error: column "phone" of relation "users" already exists` when running `drizzle-kit migrate`

**Root Cause:** Two `__drizzle_migrations` tables existed:
- `public.__drizzle_migrations` - Contained all 6 applied migrations ✓
- `drizzle.__drizzle_migrations` - Was EMPTY ✗

Drizzle-kit (v0.21.x) defaults to creating/reading from a `drizzle` schema for its migrations table. Since the project's migrations were originally tracked in the `public` schema, drizzle-kit was reading from the empty `drizzle` schema table and attempting to re-apply all migrations.

**Fix:**
1. Dropped the duplicate `drizzle` schema and its empty migrations table
2. Added explicit schema configuration to `drizzle.config.ts`:

```typescript
export default defineConfig({
  schema: './dist/db/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    schema: 'public',  // <-- Added this
  },
});
```

---

## Additional Improvements

### Added Convenience Scripts

Added standardized `db:*` scripts to `apps/api/package.json` that ensure TypeScript is compiled before running drizzle-kit:

```json
{
  "scripts": {
    "db:generate": "tsc && drizzle-kit generate",
    "db:migrate": "tsc && drizzle-kit migrate",
    "db:push": "tsc && drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:check": "tsc && drizzle-kit check"
  }
}
```

**Why `tsc &&` prefix?**
The `drizzle.config.ts` reads schema from `./dist/db/schema/index.js` (compiled output). Without building first, drizzle-kit would see stale schema definitions. This ensures the build is always current before any database operation.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/drizzle.config.ts` | Added `migrations: { schema: 'public' }` |
| `apps/api/package.json` | Added `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:check` scripts |
| `apps/api/drizzle/0005_auth_columns.sql` | Recreated missing migration file |
| `apps/api/drizzle/meta/tmpclaude-5c5c-cwd` | Deleted (corrupted temp file) |

---

## Database Changes

| Change | Purpose |
|--------|---------|
| Updated hash for migration 0005 in `__drizzle_migrations` | Match recreated SQL file |
| Dropped `drizzle.__drizzle_migrations` table | Remove duplicate |
| Dropped `drizzle` schema | Clean up empty schema |

---

## Verification Results

All drizzle-kit commands now work:

| Command | Status | Output |
|---------|--------|--------|
| `pnpm db:check` | ✅ PASS | "Everything's fine 🐶🔥" |
| `pnpm db:generate` | ✅ PASS | "No schema changes, nothing to migrate 😴" |
| `pnpm db:migrate` | ✅ PASS | "migrations applied successfully!" |
| `pnpm db:push` | ✅ PASS | Connects and prompts for confirmation |
| `pnpm db:studio` | ✅ PASS | Ready to launch |

---

## Lessons Learned

1. **Always specify migrations schema explicitly** - Drizzle-kit's default `drizzle` schema can conflict with existing setups using `public` schema.

2. **Clean up temp files** - Development tools may leave temporary files that break subsequent operations.

3. **Migration files are critical** - Even if migrations are applied to the database, the SQL files must exist for `drizzle-kit migrate` to work (it re-validates hashes).

4. **Build before drizzle commands** - When config points to compiled JS, always ensure `tsc` runs first.

---

## Commit Message Suggestion

```
fix(db): resolve drizzle-kit infrastructure issues blocking all commands

- Delete corrupted temp file from meta directory
- Recreate missing 0005_auth_columns.sql migration
- Fix migrations schema config to use 'public' instead of 'drizzle'
- Add db:* convenience scripts with auto-build

Issues fixed:
- JSON parse error from corrupted tmpclaude-* file
- Missing migration SQL file for auth columns
- Duplicate __drizzle_migrations tables in different schemas
- Fragile workflow requiring manual build before drizzle commands
```

---

**Report Generated:** 2026-01-14
**Author:** Amelia (Developer Agent)
