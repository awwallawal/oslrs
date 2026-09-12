/**
 * Trust claims — the ONE place the platform says what it has and has not checked.
 *
 * ⚠️ [AI-Review][High] 2026-09-09, Story 13-58. This module exists because the same
 * false claim was fixed once and survived in two other places.
 *
 * On 2026-08-18 `GovernmentVerifiedBadge`'s panel was corrected: it used to read
 * "NIN validated and identity confirmed", which is not true and is exactly what the
 * R1 honesty discipline forbids. **There is no NIMC path anywhere in this system,
 * and NIN validation is FORMAT-ONLY (`^\d{11}$`)** — a mod-11 checksum rejects ~74%
 * of real NINs, so it was deliberately never added.
 *
 * The badge was fixed. `VerifyWorkerPage` and `GuideVerifyWorkerPage` were not, and
 * went on telling the public, on their "What Verification Confirms" lists:
 *
 *   - "NIN has been validated"                       ← false
 *   - "Identity verified by government"              ← false
 *   - "identity has been confirmed through NIN verification"  ← false
 *
 * Three copies of one claim, one of them corrected, is not a copy problem — it is a
 * missing canonical source. So the lists live here now and every surface renders
 * THESE, and a change to what the platform actually checks moves every surface at
 * once instead of moving one and leaving two lying.
 * → [[feedback_canonical_primitive_backlog_sweep]]
 *
 * ⚠️ The strings below are byte-identical to the wording already ruled correct on
 * the badge. They were not "improved" while being extracted: a copy change and a
 * de-duplication in one commit is how you lose the ability to tell which one broke
 * something. Any wording change is Paige's, as a separate deliberate edit here.
 *
 * ⛔ Story 13-58 raises the stakes: association imports are joining the marketplace,
 * and for those people the NIN was **proxy-transcribed by the association head**.
 * "Identity verified by government" was already false; for 8,278 incoming rows it is
 * not even close.
 */

/**
 * What a government-verified badge DOES attest. Derived from
 * `fraud_detections.assessor_resolution = 'final_approved'` — an Assessor's approval
 * of the registration, and nothing about identity proofing.
 */
export const GOVERNMENT_VERIFICATION_MEANS: readonly string[] = [
  'A State Assessor reviewed this registration and approved it',
  'It was checked for duplicate and fraudulent entries',
  'An 11-digit NIN is on file',
];

/**
 * What it does NOT attest. ⚠️ This list is not boilerplate and must never be
 * trimmed for brevity: it is the half that makes the other half honest, and the
 * first line is the one the whole R1 discipline turns on.
 */
export const GOVERNMENT_VERIFICATION_DOES_NOT_MEAN: readonly string[] = [
  'We have not confirmed this identity with NIMC — the NIN is format-checked only',
  'We have not tested their skills directly',
  'We do not guarantee work quality',
  'We are not responsible for employment disputes',
];

/**
 * Claims that must never appear on any public surface, as patterns rather than
 * exact strings — the three that actually shipped were three different phrasings of
 * the same untrue idea, so matching on wording would have caught none of them.
 *
 * Used by `trust-claims.test.ts` to assert the canonical lists stay clean, and
 * available to any surface test that wants to assert its own rendered output.
 */
export const FORBIDDEN_IDENTITY_CLAIMS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /\bNIN\b[^.]{0,40}\b(validated|verified|confirmed)\b/i,
    why: 'NIN validation is FORMAT-ONLY (^\\d{11}$). Nothing validates a NIN against a registry.',
  },
  {
    /**
     * ⚠️ [AI-Review][High] 2026-09-11 — CORRECTED. The trailing lookahead only excused a
     * negation AFTER the verb, so this flagged AC3's own honest disclosure,
     * "Identity not independently verified", where the "not" sits BETWEEN the noun and the
     * verb. The per-page scoping hid it: neither page the guard was wired into renders that
     * string, and it surfaced the moment the scan was widened app-wide. A guard that reds on
     * the CORRECT copy gets deleted, not obeyed — so a negation is now excused on both sides.
     */
    pattern:
      /\bidentity\b(?![^.]{0,40}\b(?:not|never)\b)[^.]{0,40}\b(verified|confirmed|validated)\b(?![^.]{0,40}\b(?:not|never)\b)/i,
    why: 'There is no NIMC or identity-proofing path anywhere in this system.',
  },
  {
    pattern: /\bverified by (the )?government\b/i,
    why: 'The government approved a REGISTRATION; it did not verify an identity.',
  },
];
