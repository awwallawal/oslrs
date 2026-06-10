/**
 * Story 9-18 Part B (AC#B1) — canonical map of wizard-collected identity fields
 * to the questionnaire-question-name aliases that ask for the SAME information.
 *
 * Single source of truth for Pattern C "wizard field dedup": when the Step 4
 * questionnaire contains a question whose name matches one of these aliases, the
 * wizard auto-fills it from the value the user already gave in Steps 1-2 and
 * hides it from the FormRenderer flow (so the user is never asked twice).
 *
 * Consolidation note (2026-06-03 harmonization): this map ABSORBS the former
 * `nin-question-names.ts` constant. NIN is present from inception (no two-step
 * ship-then-extend). The legacy file is deleted; the `NIN_QUESTION_NAMES`
 * convenience export below preserves the exact NIN-detection behaviour at the
 * surviving call sites (FormRenderer / FormFillerPage / ClerkDataEntryPage /
 * WizardPage submit / Step5) with only an import-path change.
 *
 * The `givenName` / `familyName` keys honour the Part F (AC#F1) given/family
 * name split — Step 1 collects two explicit name fields, and any questionnaire
 * question asking for either gets pre-filled / hidden.
 *
 * Aliases are stored lowercase; matching is the caller's responsibility and is
 * case-insensitive via `findWizardFieldForQuestionName`.
 */
export const WIZARD_PROVIDED_FIELD_NAMES = {
  fullName: ['full_name', 'fullname', 'name'],
  givenName: ['given_name', 'first_name', 'firstname'],
  familyName: ['family_name', 'last_name', 'lastname', 'surname'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number'],
  email: ['email', 'email_address'],
  dob: ['date_of_birth', 'dob', 'birth_date'],
  nin: ['nin', 'national_id'],
} as const;

/**
 * The keys of {@link WIZARD_PROVIDED_FIELD_NAMES}.
 *
 * Naming note: the story (AC#B1) refers to this as `WIZARD_PROVIDED_FIELD_KEY`.
 * Exported here in idiomatic PascalCase to satisfy the project's
 * `@typescript-eslint/naming-convention` lint rule (a SCREAMING_CASE *type*
 * would fail lint). Same concept, lint-safe name.
 */
export type WizardProvidedFieldKey = keyof typeof WIZARD_PROVIDED_FIELD_NAMES;

/**
 * Reverse index: lowercased alias -> wizard field key. Built once at module
 * load so `findWizardFieldForQuestionName` is O(1) per question.
 */
const ALIAS_TO_KEY: ReadonlyMap<string, WizardProvidedFieldKey> = (() => {
  const map = new Map<string, WizardProvidedFieldKey>();
  for (const key of Object.keys(WIZARD_PROVIDED_FIELD_NAMES) as WizardProvidedFieldKey[]) {
    for (const alias of WIZARD_PROVIDED_FIELD_NAMES[key]) {
      map.set(alias.toLowerCase(), key);
    }
  }
  return map;
})();

/**
 * Case-insensitive lookup: returns the wizard field key a questionnaire question
 * name maps to, or `null` if the question is not a wizard-provided field.
 *
 * Step 4's introspection (AC#B4) becomes a one-liner per question.
 */
export function findWizardFieldForQuestionName(
  questionName: string,
): WizardProvidedFieldKey | null {
  return ALIAS_TO_KEY.get(questionName.trim().toLowerCase()) ?? null;
}

/**
 * NIN question-name allow-list — widened `readonly string[]` view of
 * `WIZARD_PROVIDED_FIELD_NAMES.nin` so `.includes(anyString)` and `for...of`
 * type-check without per-call-site casts.
 *
 * This is the canonical replacement for the deleted
 * `apps/web/src/features/registration/lib/nin-question-names.ts` constant; the
 * values are identical (`['nin', 'national_id']`), so NIN detection at every
 * surviving consumer is behaviour-preserving across the consolidation.
 */
export const NIN_QUESTION_NAMES: readonly string[] = WIZARD_PROVIDED_FIELD_NAMES.nin;

/** Legacy union type preserved for any type-safe enumeration call sites. */
export type NinQuestionName = (typeof WIZARD_PROVIDED_FIELD_NAMES.nin)[number];
