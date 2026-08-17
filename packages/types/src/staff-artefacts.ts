/**
 * Story 13-59 (AC6.2) — WHO IS ENTITLED TO WHAT, in one place.
 *
 * ## Why this lives in `@oslsr/types` and not in the API
 *
 * The first cut of this story put the rules in `staff-artefacts.service.ts`
 * under a docblock reading *"Three doors, one implementation. 13-55's lesson
 * was five hand-written copies of one operation."* The adversarial review
 * (2026-08-16, finding H3) counted **four** copies by the time it shipped:
 *
 *   1. `ID_CARD_ROLES` / `BRIEFING_ROLES` in the API service;
 *   2. `r.name IN ('enumerator', 'supervisor', 'data_entry_clerk')` as a raw
 *      SQL literal in `staff.service.ts`'s operator filter;
 *   3. the same array again in `StaffTable.tsx`, in the browser, under a
 *      comment openly admitting it was mirrored;
 *   4. and `ID_CARD_ROLES` was character-for-character `FIELD_ROLES` from
 *      `roles.ts` — the fifth copy, of a list that already existed.
 *
 * None of them were compile-checked. Adding a field role to the enum breaks
 * the build in `staff-activation-copy.ts` (a `Record<UserRole, …>` does that
 * for free) but would have left all four of these silently returning the wrong
 * people, on the screen an operator reads to decide who goes to the field.
 *
 * So the rules move HERE, where the API, the web app and the shared contract
 * can all import the same array. [[pattern-census-counts-sites-not-callers]]:
 * a census counts sites, not callers — consolidating is the only fix that
 * makes the count stay right.
 */
import { UserRole } from './constants.js';
import { FIELD_ROLES } from './roles.js';

/** The two things activation now leaves in a person's hands. */
export type ArtefactKind = 'id_card' | 'briefing';

/**
 * Roles the ID CARD applies to.
 *
 * ⚠️ **DERIVED from `FIELD_ROLES`, never re-listed.** AC6.1 says "the card is
 * not enumerator-specific", and the real rule is narrower and more durable than
 * any list: a card needs a photo, a photo is captured in the activation branch
 * that back-office roles never enter (`auth.service.ts`'s `!backOffice` guard),
 * and "not back-office" is exactly what `FIELD_ROLES` means. Writing the three
 * names out again would be a list that agrees with that rule today and drifts
 * from it the first time a field role is added.
 */
export const ID_CARD_ROLES: readonly UserRole[] = FIELD_ROLES;

/**
 * Roles the FIELD BRIEFING applies to.
 *
 * AC6.3 — enumerator-only. The briefing is written for someone knocking on
 * doors; handing it to a Government Official is noise, and noise is how a real
 * instruction gets ignored. Supervisors are deliberately excluded even though
 * they are a field role: they do not run the household interview that §1's
 * read-out rule governs.
 */
export const BRIEFING_ROLES: readonly UserRole[] = [UserRole.ENUMERATOR];

/** Does this person's role entitle them to a card at all? */
export function isIdCardRole(roleName: string): boolean {
  return (ID_CARD_ROLES as readonly string[]).includes(roleName);
}

/** Does this person's role entitle them to the field briefing at all? */
export function isBriefingRole(roleName: string): boolean {
  return (BRIEFING_ROLES as readonly string[]).includes(roleName);
}
