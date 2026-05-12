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
  const { rowCount } = await pool.query(
    `UPDATE system_settings
     SET value = $1::jsonb, updated_at = now()
     WHERE key = 'wizard.public_form_id'`,
    [jsonbValue],
  );
  if (rowCount === 0) {
    throw new Error(
      `system_settings row for 'wizard.public_form_id' not found. Run db:push:full first to apply the migrate-system-settings-init seed.`,
    );
  }
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
