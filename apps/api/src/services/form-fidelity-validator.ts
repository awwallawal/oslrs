/**
 * Story 9-54 AC3 — publish/pin-time forms-engine fidelity validator.
 *
 * Pure (no DB) so it is trivially unit-tested and reusable from both the publish
 * path (native-form.service) and any future Questionnaire-Management pin/validate
 * UI. It rejects (error) or warns when a form's logic would be silently lost or
 * broken at runtime:
 *
 *   - ERROR: a `calculate` expression uses a token outside the safe subset the
 *     runtime evaluator supports (AC3.1c) — it would never compute.
 *   - WARNING: a choice question the wizard deduplicates (gender / the two
 *     consents) whose choice list omits a value the wizard can produce
 *     (AC3.2) — dedup silently won't fire and the user is re-asked. Mirrors the
 *     web wizard map (apps/web/.../wizard-provided-field-names.ts).
 *
 * Dangling `showWhen`/section-`showWhen` references (AC3.1a — e.g. a `${age}`
 * left dangling if the `calculate` regressed) are caught by the existing
 * reference check in NativeFormService.validateForPublish, which now treats
 * retained calculation names as valid targets (AC2.3). Group-relevance
 * drop-detection (AC3.1b) requires the source XLSForm and is enforced upstream
 * by the converter now retaining group relevance (AC2).
 */

import type { NativeFormSchema } from '@oslsr/types';
import { evaluateCalculate, UnsupportedCalculateError } from '@oslsr/utils';

export interface FidelityFinding {
  level: 'error' | 'warning';
  /** Machine-readable class for filtering / tests. */
  kind: 'unsupported_calculation' | 'wizard_dedup_vocabulary';
  /** The offending question / calculation name. */
  target: string;
  message: string;
}

// Fixed clock — token validation never depends on the real date (and the
// project bans argless `new Date()` / `Date.now()` in deterministic logic).
const VALIDATION_CLOCK = new Date('2000-01-01T00:00:00.000Z');

/**
 * Choice questions the wizard deduplicates (Story 9-54 AC4) and the form-choice
 * values the wizard can map to. If a matching question's choice list omits a
 * required value, dedup won't fire — warn the author. `lgaId` is intentionally
 * omitted: its value space is form-defined, so a missing match is expected.
 */
const WIZARD_DEDUP_CHOICE_EXPECTATIONS: ReadonlyArray<{
  aliases: ReadonlySet<string>;
  requiredValues: string[];
  label: string;
}> = [
  // wizard `prefer_not_to_say` maps to the form's `other`; male/female are identity.
  { aliases: new Set(['gender', 'sex']), requiredValues: ['other'], label: 'gender' },
  { aliases: new Set(['consent_marketplace']), requiredValues: ['yes', 'no'], label: 'marketplace consent' },
  { aliases: new Set(['consent_enriched']), requiredValues: ['yes', 'no'], label: 'data-use consent' },
];

/** AC3.1c — each calculation must parse under the safe subset. */
function checkCalculations(schema: NativeFormSchema, findings: FidelityFinding[]): void {
  for (const calc of schema.calculations ?? []) {
    try {
      // Empty answer map: a `${field}` reference is "incomputable" (returns
      // undefined, no throw); only an unsupported token/function throws.
      evaluateCalculate(calc.expression, {}, VALIDATION_CLOCK);
    } catch (err) {
      if (err instanceof UnsupportedCalculateError) {
        findings.push({
          level: 'error',
          kind: 'unsupported_calculation',
          target: calc.name,
          message: `Calculation "${calc.name}" uses an unsupported expression: ${err.message}`,
        });
      } else {
        throw err;
      }
    }
  }
}

/** AC3.2 — wizard-deduped choice questions whose choice list omits a needed value. */
function checkWizardDedupVocabulary(schema: NativeFormSchema, findings: FidelityFinding[]): void {
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (question.type !== 'select_one' && question.type !== 'select_multiple') continue;
      const name = question.name.trim().toLowerCase();
      const expectation = WIZARD_DEDUP_CHOICE_EXPECTATIONS.find((e) => e.aliases.has(name));
      if (!expectation) continue;

      const choices = question.choices ? schema.choiceLists?.[question.choices] : undefined;
      const values = new Set((choices ?? []).map((c) => c.value));
      const missing = expectation.requiredValues.filter((v) => !values.has(v));
      if (missing.length > 0) {
        findings.push({
          level: 'warning',
          kind: 'wizard_dedup_vocabulary',
          target: question.name,
          message: `Question "${question.name}" (${expectation.label}) is missing choice value(s) [${missing.join(
            ', ',
          )}] that the wizard produces — it will not auto-fill from earlier answers and will re-ask the user.`,
        });
      }
    }
  }
}

/**
 * Run all fidelity checks over a migrated schema.
 * @returns errors (block publish) and warnings (acknowledge) — both actionable
 *   (name the question/calculation + reason).
 */
export function validateFormFidelity(schema: NativeFormSchema): {
  errors: FidelityFinding[];
  warnings: FidelityFinding[];
} {
  const findings: FidelityFinding[] = [];
  checkCalculations(schema, findings);
  checkWizardDedupVocabulary(schema, findings);
  return {
    errors: findings.filter((f) => f.level === 'error'),
    warnings: findings.filter((f) => f.level === 'warning'),
  };
}
