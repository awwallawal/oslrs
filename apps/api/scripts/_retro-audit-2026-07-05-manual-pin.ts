/**
 * Story 13-17 Task 5 — retroactive audit row for the 2026-07-05 manual DB pin.
 *
 * WHY: on 2026-07-05 the Public Core form was pinned as `wizard.public_form_id`
 * DIRECTLY on the prod DB (via Tailscale) because the UI pin path was blocked
 * by the 13-17 re-auth bug. A direct settings write bypasses the audited
 * SettingsService path, so there is NO `audit_logs` row for that pin. Per the
 * PM ruling (option a), this script emits the missing `settings.flipped` row
 * retroactively — through `AuditService.logActionTx` so the tamper-evident
 * hash chain stays intact (NEVER raw-INSERT into audit_logs).
 *
 * The row is stamped with TODAY's created_at (a hash-chained log cannot be
 * backdated); `details.retroactive_of` + `details.performed_at` carry the
 * true event time. Idempotent: refuses to write a second row for the same
 * `retroactive_of` marker.
 *
 * General rule this encodes (runbook): a direct prod-DB setting-write bypasses
 * audit_logs — prefer the UI once 13-17 lands; when a manual write is truly
 * unavoidable, follow it with a deliberate retroactive row like this one.
 *
 * Usage (on the box over Tailscale, prod .env loaded):
 *   tsx scripts/_retro-audit-2026-07-05-manual-pin.ts --actor-email admin@example.com          # dry-run
 *   tsx scripts/_retro-audit-2026-07-05-manual-pin.ts --actor-email admin@example.com --apply  # write
 *   # --old-value <form-id|null> optionally records the value the pin replaced
 *   # (the 2026-07-05 write also fixed a dangling pin; pass it if known).
 *
 * Exit codes: 0 ok (dry-run or applied or already-present), 1 error/bad args.
 */
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../src/db/index.js';
import { users, roles } from '../src/db/schema/index.js';
import { AuditService, AUDIT_ACTIONS } from '../src/services/audit.service.js';
import { getSettingRow } from '../src/lib/settings.js';

const logger = pino({ name: 'retro-audit-manual-pin' });

const RETROACTIVE_OF = '2026-07-05-manual-db-pin-wizard-public-form-id';
const SETTING_KEY = 'wizard.public_form_id';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  // Guard the bare-flag hole (13-16 review M1): a following flag is not a value.
  if (!val || val.startsWith('--')) {
    console.error(`ERROR: ${flag} requires a value`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const actorEmail = argValue('--actor-email');
  const actorIdArg = argValue('--actor-id');
  const oldValueArg = argValue('--old-value');

  if (!actorEmail && !actorIdArg) {
    console.error('ERROR: pass --actor-email <email> or --actor-id <uuid> (the super-admin who ran the manual pin)');
    process.exit(1);
  }

  // Resolve + verify the actor (must exist and be a super_admin).
  const actorRows = await db
    .select({ id: users.id, email: users.email, role: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(actorIdArg ? eq(users.id, actorIdArg) : eq(users.email, actorEmail!));

  if (actorRows.length !== 1) {
    console.error(`ERROR: expected exactly 1 matching user, found ${actorRows.length}`);
    process.exit(1);
  }
  const actor = actorRows[0];
  if (actor.role !== 'super_admin') {
    console.error(`ERROR: actor ${actor.email} has role '${actor.role}', expected super_admin`);
    process.exit(1);
  }

  // The pinned value the 2026-07-05 write set — read the CURRENT setting so the
  // audit row records the real form id, not a transcribed one.
  const settingRow = await getSettingRow(SETTING_KEY);
  if (!settingRow || settingRow.value == null) {
    console.error(`ERROR: ${SETTING_KEY} is not set — nothing to retro-audit (was the pin reverted?)`);
    process.exit(1);
  }
  const pinnedFormId = settingRow.value as string;

  // Idempotency: refuse a second retroactive row for the same event.
  const existing = await db.execute(
    sql`SELECT id FROM audit_logs WHERE action = ${AUDIT_ACTIONS.SETTINGS_FLIPPED} AND details->>'retroactive_of' = ${RETROACTIVE_OF} LIMIT 1`,
  );
  if (existing.rows.length > 0) {
    console.log(`Already present: retroactive audit row ${(existing.rows[0] as { id: string }).id} — nothing to do.`);
    process.exit(0);
  }

  const details = {
    key: SETTING_KEY,
    old_value: oldValueArg === 'null' ? null : (oldValueArg ?? null),
    new_value: pinnedFormId,
    retroactive: true,
    retroactive_of: RETROACTIVE_OF,
    performed_at: '2026-07-05',
    reason:
      'Manual DB pin via Tailscale — the audited UI path was blocked by the step-up re-auth bug fixed in Story 13-17. ' +
      'Post-write verification: GET /forms/public-active returned 200 with the pinned form.',
  };

  console.log(`\nRetroactive ${AUDIT_ACTIONS.SETTINGS_FLIPPED} audit row for the 2026-07-05 manual pin:`);
  console.log(`  actor:     ${actor.email} (${actor.id})`);
  console.log(`  target:    system_settings / ${SETTING_KEY}`);
  console.log(`  new_value: ${pinnedFormId}`);
  console.log(`  old_value: ${details.old_value ?? '(unknown — not passed)'}`);

  if (!apply) {
    console.log('\nDRY-RUN — no row written. Re-run with --apply to emit it.\n');
    process.exit(0);
  }

  // Through the service (hash chain), transactional so a failure is loud.
  await db.transaction(async (tx) => {
    await AuditService.logActionTx(tx, {
      actorId: actor.id,
      action: AUDIT_ACTIONS.SETTINGS_FLIPPED,
      targetResource: 'system_settings',
      targetId: null,
      details,
      ipAddress: 'operator-script',
      userAgent: '_retro-audit-2026-07-05-manual-pin.ts',
    });
  });

  logger.info({ event: 'retro_audit.emitted', actorId: actor.id, key: SETTING_KEY });
  console.log('\n✅ Retroactive audit row written (hash chain intact).\n');
  process.exit(0);
}

if (!process.env.VITEST) {
  main().catch((err) => {
    logger.error({ event: 'retro_audit.fatal', error: (err as Error).message });
    console.error(`FATAL: ${(err as Error).message}`);
    process.exit(1);
  });
}
