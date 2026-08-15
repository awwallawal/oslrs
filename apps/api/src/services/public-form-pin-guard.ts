/**
 * Story 13-57 AC5.2 — REFUSE A PIN THAT WOULD SILENTLY STOP FEEDING THE REGISTER.
 *
 * `wizard.public_form_id` is the setting that decides which questionnaire the
 * public wizard renders and which form every public registration is read
 * against. Re-uploading a workbook mints a NEW `questionnaire_forms` row and
 * makes re-pinning MANDATORY ([[project_public_wizard_form_update]]), so this
 * is a routine operator action — and it is the exact point at which a renamed
 * or dropped question starts costing real registrations with no error anywhere.
 *
 * This module is deliberately tiny and separate from `ingestion-contract.ts`:
 * the checker stays pure and unit-testable, and the DB lookup lives here.
 */
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import type { NativeFormSchema } from '@oslsr/types';
import { db } from '../db/index.js';
import { questionnaireForms } from '../db/schema/index.js';
import {
  checkIngestionContract,
  describeIngestionContractFindings,
} from './ingestion-contract.js';
import pino from 'pino';

const logger = pino({ name: 'public-form-pin-guard' });

/** The one setting key that pins the public wizard's questionnaire. */
export const PUBLIC_FORM_SETTING_KEY = 'wizard.public_form_id';

/**
 * Throws when `key` is the public-form pin and the referenced form cannot feed
 * the ingestion pipeline. A no-op for every other setting.
 *
 * ⚠️ UNPINNING IS ALLOWED. Setting the key to `null` takes the public wizard's
 * questionnaire step offline (`getPublicActiveForm` already returns
 * PUBLIC_FORM_NOT_CONFIGURED and Step 4 is skipped) — that is a deliberate
 * operator action, not a broken contract, and refusing it would leave someone
 * unable to switch off a form that is actively causing harm.
 *
 * ⚠️ A MISSING FORM ROW IS NOT THIS GUARD'S BUSINESS. If the id points at
 * nothing, this returns without an opinion rather than inventing a contract
 * error for what is a different mistake — and one the renderer already reports.
 */
export async function assertPinnedFormHonoursIngestionContract(
  key: string,
  value: unknown,
): Promise<void> {
  if (key !== PUBLIC_FORM_SETTING_KEY) return;
  if (value === null || value === undefined || value === '') return;
  if (typeof value !== 'string') return;

  const form = await db.query.questionnaireForms.findFirst({
    where: eq(questionnaireForms.id, value),
    columns: { id: true, formSchema: true },
  });
  if (!form?.formSchema) return;

  const findings = checkIngestionContract(form.formSchema as NativeFormSchema);
  if (findings.length === 0) return;

  logger.error(
    {
      event: 'wizard.public_form_pin_refused',
      formId: value,
      findings: findings.map((f) => ({ kind: f.kind, target: f.target })),
    },
    'Refused to pin a public form that the ingestion pipeline cannot read in full.',
  );

  throw new AppError(
    'FORM_INGESTION_CONTRACT_VIOLATION',
    // The message names the field AND its consumer (AC5.2), because the person
    // reading it is holding a workbook and needs to know what to put back.
    `This form cannot be pinned as the public questionnaire. ${describeIngestionContractFindings(findings)}`,
    422,
    {
      formId: value,
      findings: findings.map((f) => ({
        kind: f.kind,
        target: f.target,
        acceptedNames: f.acceptedNames,
        message: f.message,
      })),
    },
  );
}
