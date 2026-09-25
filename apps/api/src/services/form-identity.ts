/**
 * Story 13-73 AC5 — snapshot a submission's FORM IDENTITY at insert.
 *
 * `submissions.questionnaire_form_id` names a `questionnaire_forms` ROW, and until
 * 13-73 that row was the only record of what a submission was answered against.
 * Deleting it — which the lifecycle permitted for any archived form — orphaned 283
 * submissions across 5 form ids (measured 2026-09-18). This resolves the row's
 * logical `form_id` + `version` so the insert can copy them onto the submission,
 * where they survive the row.
 *
 * Every submission producer that writes a REAL form id calls this; the ones that
 * write a channel sentinel (`self-edit`, `import:<source>`, the supplemental
 * survey) have no form to snapshot and leave both columns null by construction.
 */

import { eq } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';

const logger = pino({ name: 'form-identity' });

/** `questionnaire_forms.id` is a UUID; anything else in the TEXT column is a sentinel. */
const FORM_ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FormIdentitySnapshot {
  formIdLogical: string | null;
  formVersion: string | null;
}

const NO_IDENTITY: FormIdentitySnapshot = { formIdLogical: null, formVersion: null };

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * ⚠️ FAIL-OPEN, on purpose. This is provenance, and it must never cost a citizen
 * their registration or an enumerator their submission (the 9-26 lesson). A
 * failure is LOGGED, so a snapshot that stops being written is visible rather than
 * silent.
 *
 * ⚠️ A CALLER INSIDE A TRANSACTION PASSES ITS `tx` (13-73 code review). The lookup
 * then runs on the caller's connection inside a SAVEPOINT (drizzle's nested
 * `tx.transaction`): a failed query rolls back to the savepoint and the caller's
 * transaction carries on, where a bare failure would abort it. Reading through `db`
 * instead — the first version — checked a SECOND connection out of the pool (max
 * 20, 2 s acquire timeout) while the caller held one, so 20 concurrent
 * registrations could hold the whole pool and each wait 2 s for a 21st. Without a
 * `tx` (the ingestion worker, adoption) it reads through `db`.
 */
export async function snapshotFormIdentity(
  questionnaireFormId: string | null | undefined,
  tx?: DbTransaction,
): Promise<FormIdentitySnapshot> {
  if (!questionnaireFormId || !FORM_ROW_ID.test(questionnaireFormId)) return NO_IDENTITY;

  const lookup = (executor: DbTransaction | typeof db) =>
    executor
      .select({ formId: questionnaireForms.formId, version: questionnaireForms.version })
      .from(questionnaireForms)
      .where(eq(questionnaireForms.id, questionnaireFormId))
      .limit(1);

  try {
    const [form] = tx ? await tx.transaction((sp) => lookup(sp)) : await lookup(db);

    if (!form) {
      // A submission arriving against a form row that is already GONE — the exact
      // shape measured on prod (a form deleted while submissions still arrived).
      logger.warn({ event: 'form_identity.form_row_missing', questionnaireFormId });
      return NO_IDENTITY;
    }
    return { formIdLogical: form.formId, formVersion: form.version };
  } catch (err) {
    logger.warn({ event: 'form_identity.snapshot_failed', questionnaireFormId, error: String(err) });
    return NO_IDENTITY;
  }
}
