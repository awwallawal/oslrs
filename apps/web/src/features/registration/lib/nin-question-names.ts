/**
 * Shared NIN question-name allow-list (Story 9-12 Dev Notes "Step 5 NIN
 * handling — state-aware dispatcher"). The FormFillerPage already relies on
 * this list to special-case the NIN question; the wizard reuses the SAME
 * constant via this re-export so the schema-introspection check in Step 4
 * cannot drift from the renderer's NIN-detection logic.
 *
 * Adding a new NIN name here propagates to BOTH the renderer (real-time
 * NIN-availability check) AND the wizard (State A/B/C dispatcher).
 */
// Widened to `readonly string[]` so `.includes(anyString)` type-checks without
// per-call-site casts. The literal `NinQuestionName` union is still exported
// for places that want type-safe enumeration.
export const NIN_QUESTION_NAMES: readonly string[] = ['nin', 'national_id'];
export type NinQuestionName = 'nin' | 'national_id';
