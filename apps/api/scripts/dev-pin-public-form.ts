/**
 * Dev helper — pin a published questionnaire form as the public-wizard form
 * by writing to the `wizard.public_form_id` row in `system_settings`.
 *
 * Why this exists:
 *   Story 9-12 ships Option B form discovery (Task 5.4) — the wizard reads
 *   `wizard.public_form_id` from `system_settings`; the seed-runner installs
 *   it with `null` so no form is pinned by default. Until Story 9-17 lands
 *   the proper "Pin for Public Wizard" UI on the Questionnaire Management
 *   page, developers (and the operator on a fresh local DB) need a fast way
 *   to make Step 4 actually render something during UAT.
 *
 * Usage:
 *   pnpm --filter @oslsr/api pin-public-form              # auto-pick latest published
 *   pnpm --filter @oslsr/api pin-public-form <form-uuid>  # pin a specific form
 *   pnpm --filter @oslsr/api pin-public-form --list       # print the published forms + exit
 *   pnpm --filter @oslsr/api pin-public-form --unpin      # null out the setting
 *
 * Safe to run repeatedly — idempotent; the underlying setting is a single
 * row update.
 *
 * TODO 9-17: delete this script once the UI lands on the Questionnaire
 * Management page. Until then, ops + devs use it.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[dev-pin-public-form] DATABASE_URL not set; aborting.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

interface FormRow {
  id: string;
  form_id: string;
  title: string;
  version: string;
  status: string;
  native_published_at: Date | null;
}

interface SettingRow {
  key: string;
  value: unknown;
}

async function listPublishedForms(): Promise<FormRow[]> {
  const { rows } = await pool.query<FormRow>(`
    SELECT id, form_id, title, version, status, native_published_at
    FROM questionnaire_forms
    WHERE status = 'published'
    ORDER BY native_published_at DESC NULLS LAST, created_at DESC
  `);
  return rows;
}

async function getCurrentPin(): Promise<string | null> {
  const { rows } = await pool.query<SettingRow>(
    `SELECT value FROM system_settings WHERE key = 'wizard.public_form_id'`,
  );
  if (rows.length === 0) return null;
  const v = rows[0].value;
  // value is JSONB — comes back as a JS value (string | null) already parsed.
  if (typeof v === 'string') return v;
  return null;
}

async function setPin(formId: string | null): Promise<void> {
  const jsonbValue = formId === null ? 'null' : JSON.stringify(formId);

  // Common case once the seed runner has installed the row: plain UPDATE.
  const updateResult = await pool.query(
    `UPDATE system_settings
     SET value = $1::jsonb, updated_at = now()
     WHERE key = 'wizard.public_form_id'`,
    [jsonbValue],
  );
  if (updateResult.rowCount && updateResult.rowCount > 0) return;

  // Row missing — happens on stale local DBs that were last seeded BEFORE
  // Story 9-12 Session 3 (2026-05-11) added the `wizard.public_form_id`
  // entry to migrate-system-settings-init.ts. The seed is idempotent so the
  // canonical fix is `pnpm --filter @oslsr/api tsx scripts/migrate-system-settings-init.ts`,
  // but we self-heal here too so the dev script Just Works on any state.
  console.log('[dev-pin-public-form] system_settings row missing; auto-inserting (mirrors the seed runner).');

  // updated_by has an FK to users(id). Reuse the seed runner's
  // "first-active-super-admin" pick so the actor attribution matches the
  // canonical seed path exactly.
  const adminResult = await pool.query<{ id: string }>(`
    SELECT u.id
    FROM users u
    INNER JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'super_admin' AND u.status = 'active'
    ORDER BY u.created_at ASC
    LIMIT 1
  `);
  if (adminResult.rows.length === 0) {
    throw new Error(
      `[dev-pin-public-form] No active super_admin found in users table. Run \`pnpm --filter @oslsr/api db:seed --admin-from-env\` first so the seed runner has an actor to attribute the insert to, then retry.`,
    );
  }
  const superAdminId = adminResult.rows[0].id;

  await pool.query(
    `INSERT INTO system_settings (key, value, description, updated_by, updated_at, created_at)
     VALUES (
       'wizard.public_form_id',
       $1::jsonb,
       $2,
       $3,
       now(),
       now()
     )
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [
      jsonbValue,
      'UUID of the published questionnaire that the public registration wizard renders on Step 4. Null = wizard shows empty-state and skips Step 4.',
      superAdminId,
    ],
  );
}

function printForms(forms: FormRow[], currentPin: string | null): void {
  if (forms.length === 0) {
    console.log('No published questionnaire forms found.');
    console.log('Upload + publish a form via the Questionnaire Management page first.');
    return;
  }
  console.log(`\n${forms.length} published form(s):\n`);
  for (const f of forms) {
    const pinned = f.id === currentPin ? '  📌 PINNED' : '';
    const publishedAt = f.native_published_at
      ? f.native_published_at.toISOString().slice(0, 19) + 'Z'
      : '(no native_published_at)';
    console.log(`  ${f.id}  v${f.version}  ${publishedAt}  ${f.title}${pinned}`);
  }
  console.log('');
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsList = args.includes('--list');
  const wantsUnpin = args.includes('--unpin');
  const explicitFormId = args.find((a) => !a.startsWith('--'));

  const currentPin = await getCurrentPin();

  if (wantsList) {
    const forms = await listPublishedForms();
    printForms(forms, currentPin);
    return;
  }

  if (wantsUnpin) {
    await setPin(null);
    console.log('[dev-pin-public-form] Un-pinned. Wizard Step 4 will now render the empty-state.');
    return;
  }

  const forms = await listPublishedForms();
  if (forms.length === 0) {
    console.error('[dev-pin-public-form] No published forms found. Upload + publish one first.');
    process.exit(1);
  }

  let targetId: string;
  if (explicitFormId) {
    const found = forms.find((f) => f.id === explicitFormId || f.form_id === explicitFormId);
    if (!found) {
      console.error(`[dev-pin-public-form] No published form matches id "${explicitFormId}".`);
      console.error('[dev-pin-public-form] Run with --list to see available forms.');
      process.exit(1);
    }
    targetId = found.id;
  } else {
    // Auto-pick: the most-recently-published form.
    targetId = forms[0].id;
    console.log(`[dev-pin-public-form] No form id specified — auto-picking most recent.`);
  }

  if (currentPin === targetId) {
    console.log(`[dev-pin-public-form] Form ${targetId} is already pinned. No change.`);
    return;
  }

  await setPin(targetId);
  const pinned = forms.find((f) => f.id === targetId);
  console.log(
    `[dev-pin-public-form] ✓ Pinned ${pinned?.title ?? targetId} (v${pinned?.version ?? '?'}, id=${targetId}).`,
  );
  console.log('[dev-pin-public-form] Reload /register → Step 4 should now render the form.');
  console.log('[dev-pin-public-form] NOTE: React Query staleTime is 5 min. Hard-refresh if needed.');
}

run()
  .catch((err) => {
    console.error('[dev-pin-public-form] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
