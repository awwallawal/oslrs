# Database Migration Workflow Guide

> **For:** Developers and AI agents working on OSLSR
> **Stack:** Drizzle ORM 0.30.x + drizzle-kit 0.21.x + PostgreSQL 15
> **Last updated:** 2026-02-11

---

## Quick Reference

| I want to... | Command | When to use |
|---|---|---|
| Add columns/tables/indexes (dev) | `pnpm db:push` | Local development, non-destructive changes |
| Force push destructive changes (dev) | `pnpm db:push:force` | Local dev, when push prompts interactively |
| Generate migration SQL | `pnpm db:generate` | Before deploying to staging/production |
| Apply pending migrations | `pnpm db:migrate` | Staging/production deployments |
| Reset local database | `pnpm db:reset` | Start fresh with clean schema + dev seed |
| Reset without seed data | `pnpm db:reset -- --no-seed` | Clean schema only |
| Check schema consistency | `pnpm db:check` | Verify schema matches migration history |
| Browse database visually | `pnpm db:studio` | Opens Drizzle Studio GUI |
| Seed development data | `pnpm db:seed:dev` | Add 7 test users with known passwords |
| Remove seed data only | `pnpm db:seed:clean` | Remove `isSeeded: true` records |

**All db:\* commands must be run from the `apps/api` directory** (or with `pnpm --filter @oslsr/api`).

---

## Development Workflow (Day-to-Day)

### Adding Columns, Tables, or Indexes

This is the most common schema change. Use `db:push` for fast iteration.

```bash
# 1. Edit schema source files
#    apps/api/src/db/schema/*.ts

# 2. Push changes to local database
pnpm db:push

# 3. Verify schema applied
pnpm db:check
```

`db:push` compiles TypeScript first (`tsc`), then applies the schema diff directly to the database. For non-destructive changes (adding columns, tables, indexes), this runs without any prompts.

### When db:push Prompts Interactively

drizzle-kit 0.21.x prompts when it detects operations that could cause data loss:
- Dropping columns
- Dropping tables
- Changing column types
- Adding unique constraints (known bug in 0.21.x)
- Truncating tables

**Option A: Use force push (auto-approves all prompts)**
```bash
pnpm db:push:force
```

**Option B: Use the migration workflow instead (recommended for type changes)**
```bash
# Generate migration SQL
pnpm db:generate

# Review the generated SQL in apps/api/drizzle/
# Edit if needed (add USING clause for type changes)

# Apply the migration
pnpm db:migrate
```

### Resetting Your Local Database

When you need a clean slate (e.g., after schema experiments, corrupted data, switching branches):

```bash
# Full reset: drop all tables, re-apply schema, seed dev data
pnpm db:reset

# Reset without seeding
pnpm db:reset -- --no-seed
```

The reset script:
1. Drops all tables and custom types in the `public` schema (via raw SQL, no interactive prompts)
2. Runs `drizzle-kit migrate` to re-create the schema from migration files (deterministic, no prompts)
3. Runs `db:seed:dev` to create 7 test users (unless `--no-seed`)

---

## Production Workflow (Staging & Production)

### NEVER use `db:push` in staging or production.

Always use the migration workflow: `db:generate` + review + `db:migrate`.

### Step-by-Step: Non-Destructive Changes

```bash
# 1. Edit schema source files
#    apps/api/src/db/schema/*.ts

# 2. Generate migration SQL
pnpm db:generate
# Creates a new file in apps/api/drizzle/ like 0016_some_name.sql

# 3. Review the generated SQL
git diff apps/api/drizzle/

# 4. Apply the migration
pnpm db:migrate

# 5. Commit the migration file with your schema changes
git add apps/api/drizzle/ apps/api/src/db/schema/
git commit -m "feat: add xyz column to submissions table"
```

### Step-by-Step: Destructive Changes

Column type changes, drops, and renames require manual migration SQL because PostgreSQL cannot auto-convert data types.

```bash
# 1. Edit schema source files
#    apps/api/src/db/schema/*.ts

# 2. Generate migration SQL
pnpm db:generate
# WARNING: Review the generated SQL carefully!
# Drizzle may generate DROP + CREATE instead of ALTER for type changes.

# 3. If the generated SQL is wrong, write manual migration
#    Create a new file: apps/api/drizzle/0016_your_description.sql
#    See "Manual Migration SQL Patterns" below

# 4. Apply the migration
pnpm db:migrate

# 5. Verify schema matches expectations
pnpm db:check
```

---

## Manual Migration SQL Patterns

### Column Type Change (Requires USING Clause)

PostgreSQL cannot auto-convert column types. You must provide an explicit cast.

```sql
-- Example: text -> bytea (from Story 2-1)
ALTER TABLE questionnaire_files
ALTER COLUMN file_blob TYPE bytea
USING file_blob::bytea;

-- Example: text -> integer
ALTER TABLE some_table
ALTER COLUMN some_column TYPE integer
USING some_column::integer;

-- Example: varchar(n) -> text (usually safe, auto-converts)
ALTER TABLE some_table
ALTER COLUMN some_column TYPE text;
```

**Always check for existing data first:**
```sql
SELECT COUNT(*) FROM table_name WHERE column_name IS NOT NULL;
```

### Column Rename

```sql
-- From migration 0014: ODK column renames
ALTER TABLE submissions
  RENAME COLUMN odk_submission_id TO submission_uid;
```

### Add Column with Default

```sql
-- From migration 0015: Native form columns
ALTER TABLE questionnaire_forms
  ADD COLUMN IF NOT EXISTS form_schema JSONB,
  ADD COLUMN IF NOT EXISTS is_native BOOLEAN DEFAULT false;
```

### Create Index

```sql
-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_questionnaire_forms_form_schema
  ON questionnaire_forms USING GIN (form_schema);

-- B-tree index for lookups
CREATE INDEX IF NOT EXISTS idx_submissions_enumerator_id
  ON submissions (enumerator_id);
```

### Drop Column

```sql
-- Always use IF EXISTS to make migrations idempotent
ALTER TABLE some_table
  DROP COLUMN IF EXISTS obsolete_column;
```

### Common Type Change Reference

| From | To | USING Clause | Safe? |
|---|---|---|---|
| `text` | `bytea` | `column::bytea` | Only if text is valid hex/base64 |
| `text` | `integer` | `column::integer` | Only if text contains numbers |
| `varchar(n)` | `text` | Auto-converts | Yes |
| `integer` | `bigint` | Auto-converts | Yes |
| `text` | `jsonb` | `column::jsonb` | Only if text is valid JSON |
| `timestamp` | `timestamptz` | Auto-converts | Yes (assumes UTC) |

---

## Environment-Specific Workflows

### Local Development

```bash
# Quick schema iteration
pnpm db:push              # Non-destructive changes
pnpm db:push:force        # Destructive changes (auto-approves)

# Full reset
pnpm db:reset             # Drop all + push + seed:dev

# Browse data
pnpm db:studio            # Opens Drizzle Studio at https://local.drizzle.studio
```

### CI/CD Pipeline

```bash
# Apply migrations only (never push in CI)
pnpm db:migrate

# Seed for integration tests
pnpm db:seed:dev
```

**Important:** CI should use `db:migrate`, not `db:push`. Migration files are version-controlled and reviewed, making deployments deterministic.

### Staging / Production

```bash
# 1. Generate migration SQL (on developer machine)
pnpm db:generate

# 2. Review generated SQL
git diff apps/api/drizzle/

# 3. Commit and deploy
git add apps/api/drizzle/
git commit -m "migration: add xyz column"
git push

# 4. On deployment, migrations run automatically OR:
pnpm db:migrate

# 5. Seed (first deployment only)
pnpm db:seed --admin-from-env
```

---

## Common Errors & Troubleshooting

### "column X cannot be cast automatically to type Y"

**Cause:** You changed a column's data type in the schema, and `db:push` or `db:migrate` tried to ALTER the column without an explicit cast.

**Fix:** Write manual migration SQL with a USING clause:
```sql
ALTER TABLE table_name
ALTER COLUMN column_name TYPE new_type
USING column_name::new_type;
```

**Prevention:** When changing column types in schema files, always write a manual migration file immediately.

### Interactive prompt blocks db:push

**Cause:** drizzle-kit 0.21.x prompts when it detects destructive schema changes (column drops, type changes, table drops, unique constraints).

**Fix options:**
1. Use `pnpm db:push:force` to auto-approve the prompt
2. Use `pnpm db:generate && pnpm db:migrate` instead (recommended for type changes)
3. Use `pnpm db:reset` if you want to start fresh

### "relation X already exists"

**Cause:** Migration was partially applied, or you manually created a table/index that the migration also creates.

**Fix:**
```sql
-- Check current schema state
\dt                          -- List all tables
\di                          -- List all indexes
\d table_name               -- Describe specific table

-- If migration is partially applied, manually complete it
-- Then mark the migration as applied in the drizzle migration journal
```

### Schema drift (db:check reports differences)

**Cause:** Direct SQL changes to the database without updating schema files, or migration files that don't match schema.

**Fix:**
```bash
# See what Drizzle thinks the diff is
pnpm db:generate

# Review the generated migration
# If it looks correct, apply it
pnpm db:migrate

# If the database is correct and schema files need updating,
# update the schema files to match the database state
```

### "tsc" compilation errors before db commands

**Cause:** All db:\* commands run `tsc` first because the drizzle config points to compiled JS (`./dist/db/schema/index.js`).

**Fix:** Fix the TypeScript errors first. Common causes:
- Missing type imports after schema changes
- Broken references to deleted/renamed columns
- Type mismatches between schema and application code

---

## Drizzle Kit Version Constraints

### Current Versions

| Package | Version | Caret Range |
|---|---|---|
| `drizzle-orm` | 0.30.10 | `^0.30.10` (0.30.x only) |
| `drizzle-kit` | 0.21.4 | `^0.21.2` (0.21.x only) |

### Known Limitations in drizzle-kit 0.21.x

1. **No `--force` flag**: Cannot suppress interactive prompts via CLI flag. The `db:push:force` script works around this with a stdin wrapper.
2. **Unique constraint prompt bug**: Adding unique constraints sometimes triggers a prompt even for non-destructive changes.
3. **`drizzle-kit drop` is interactive**: Cannot drop migration history non-interactively. The `db:reset` script bypasses this with raw SQL.

### Upgrade Considerations

drizzle-kit 0.22+ introduces `--force` flag, and later versions improve prompt handling. However:

- drizzle-orm and drizzle-kit versions must be upgraded together
- Latest stable: drizzle-kit 0.31.9 + drizzle-orm 0.45.1 (10 minor versions ahead)
- API changes between versions may break existing code
- Always run full test suite after upgrading

**If upgrading:**
1. Bump both packages together
2. Run `pnpm db:check` before and after to verify no schema drift
3. Run `pnpm test` to catch API changes
4. Test all db:\* scripts manually

---

## Project-Specific Notes

### Schema Source of Truth

- **TypeScript schema files:** `apps/api/src/db/schema/*.ts`
- **Compiled schema (used by drizzle-kit):** `apps/api/dist/db/schema/index.js`
- **Migration files:** `apps/api/drizzle/` (squashed to single baseline: 0000)
- **Drizzle config:** `apps/api/drizzle.config.ts`

### Rules

- **NEVER** modify or delete existing migration files in `apps/api/drizzle/`
- **NEVER** run `db:push` in staging or production
- **NEVER** use `drizzle-kit drop` in production (drops ALL tables)
- **NEVER** commit migration SQL without reviewing it
- **NEVER** upgrade drizzle-orm/drizzle-kit without running the full test suite
- **ALWAYS** use UUIDv7 for primary keys (see `project-context.md`)
- **ALWAYS** use snake_case for database column and table names

### Database Seeding (ADR-017)

| Command | Environment | What it does |
|---|---|---|
| `pnpm db:seed:dev` | Local dev | 7 test users with `@dev.local` emails |
| `pnpm db:seed --admin-from-env` | Staging/Prod | Super Admin from `SUPER_ADMIN_EMAIL` env var |
| `pnpm db:seed:clean` | Any | Removes only `isSeeded: true` records |

### Real Examples from Project History

**Story 2-1 to 2-2:** Changed `questionnaire_files.file_blob` from `text` (base64) to `bytea` (binary). `db:push` failed with: `column "file_blob" cannot be cast automatically to type bytea`. Required manual SQL: `ALTER TABLE ... USING file_blob::bytea`.

**Migration 0013:** Manually written `remove_odk_integration.sql` to drop ODK-specific columns and tables during the ODK-to-native-forms pivot (SCP-2026-02-05-001).

**Migration 0014:** Column renames from ODK naming to generic naming (`odk_submission_id` -> `submission_uid`).

**Migration 0015:** Added JSONB columns and GIN indexes for the native form schema system.
