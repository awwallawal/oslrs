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
 *
 * ⚠️ VALUE-VOCABULARY CONSTRAINT (9-18 Part-E review, finding H1) — a wizard
 * field's value vocabulary may DIFFER from the matched questionnaire question's.
 * Free-text / date fields (fullName/givenName/familyName/phone/email/dob/nin)
 * share the vocabulary, so their wizard value auto-fills the answer directly.
 * CHOICE fields (gender / lgaId / the two consents) DO NOT: the wizard's `gender`
 * uses `prefer_not_to_say` vs the form's `gender_list` `other`; consent is a
 * boolean here but `yes_no` in the form; `lgaId` may not match the form's
 * `lga_list` keys. Story 9-54 (AC4) adds the wizard-value → questionnaire-choice
 * MAPPING layer below ({@link mapWizardValueToChoice} + {@link WIZARD_CHOICE_FIELD_KEYS}):
 * a choice field is only deduped AFTER its wizard value maps to a value that
 * actually exists in the target question's choice list; otherwise the question
 * is shown (never an invalid choice injected). The collision-detector test pins
 * the canonical key set + the choice-field membership.
 */
export const WIZARD_PROVIDED_FIELD_NAMES = {
  fullName: ['full_name', 'fullname', 'name'],
  givenName: ['given_name', 'first_name', 'firstname'],
  familyName: ['family_name', 'last_name', 'lastname', 'surname'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number'],
  email: ['email', 'email_address'],
  dob: ['date_of_birth', 'dob', 'birth_date'],
  nin: ['nin', 'national_id'],
  // Story 9-54 AC4 — CHOICE fields. Safe to dedup ONLY via mapWizardValueToChoice.
  gender: ['gender', 'sex'],
  lgaId: ['lga', 'lga_id', 'lga_of_residence', 'local_government'],
  consentMarketplace: ['consent_marketplace'],
  consentEnriched: ['consent_enriched'],
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

/**
 * Story 9-54 AC4 — wizard keys whose value vocabulary differs from the
 * questionnaire's choice lists. These MUST be deduped through
 * {@link mapWizardValueToChoice}, never auto-filled raw.
 */
export const WIZARD_CHOICE_FIELD_KEYS: ReadonlySet<WizardProvidedFieldKey> = new Set([
  'gender',
  'lgaId',
  'consentMarketplace',
  'consentEnriched',
]);

/** Minimal choice shape ({@link Choice} from @oslsr/types) the mapper needs. */
interface ChoiceLike {
  value: string;
}

/**
 * Explicit wizard→form value remaps where the vocabularies are known to differ.
 * Only the genuinely-divergent values are listed; everything else is identity
 * and validated by the choice-list membership check below.
 */
const GENDER_VALUE_MAP: Record<string, string> = {
  prefer_not_to_say: 'other',
};

/**
 * Story 9-54 AC4 — map a wizard-collected value to a value that EXISTS in the
 * target question's choice list, or return `undefined` when no safe mapping is
 * possible. A caller that gets `undefined` must NOT dedup the question (show it)
 * rather than write an invalid choice value.
 *
 * @param key         the wizard field key (must be a choice key)
 * @param wizardValue the raw value the wizard collected (boolean / string)
 * @param choices     the target question's resolved choice list
 */
export function mapWizardValueToChoice(
  key: WizardProvidedFieldKey,
  wizardValue: unknown,
  choices: readonly ChoiceLike[] | undefined,
): string | undefined {
  if (wizardValue === undefined || wizardValue === null || wizardValue === '') return undefined;
  if (!choices || choices.length === 0) return undefined;

  let candidate: string;
  if (key === 'consentMarketplace' || key === 'consentEnriched') {
    // boolean → yes_no vocabulary
    if (wizardValue === true || wizardValue === 'yes') candidate = 'yes';
    else if (wizardValue === false || wizardValue === 'no') candidate = 'no';
    else candidate = String(wizardValue);
  } else if (key === 'gender') {
    const raw = String(wizardValue);
    candidate = GENDER_VALUE_MAP[raw] ?? raw;
  } else {
    // lgaId (and any future choice key): identity candidate, reconciled purely
    // by the choice-list membership guard — if the wizard's value is already a
    // valid choice key it dedups, otherwise the question is shown.
    candidate = String(wizardValue);
  }

  return choices.some((c) => c.value === candidate) ? candidate : undefined;
}
