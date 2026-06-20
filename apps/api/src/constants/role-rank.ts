/**
 * Server-side role privilege ranking — Story 9-45 AC#4 (F-021).
 *
 * Used to enforce, in the service layer, that an actor can never assign a role
 * MORE privileged than their own (privilege-escalation guard). Keeping the
 * invariant in `staff.service.updateRole` means it survives any future change to
 * the route-level `authorize(...)` guard — defense in depth, not a single gate.
 *
 * Higher number = more privileged. `super_admin` is the ceiling. The exact
 * ordering of the middle tiers is conservative; what matters for the security
 * invariant is that nobody can grant ABOVE themselves, and that `super_admin`
 * sits strictly at the top.
 */
import { AppError } from '@oslsr/utils';

export const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  government_official: 70,
  verification_assessor: 60,
  supervisor: 50,
  data_entry_clerk: 30,
  enumerator: 30,
  public_user: 10,
};

/**
 * Rank for a role name. Unknown roles return `null` so callers FAIL CLOSED
 * (treat an unrecognized role as un-assignable / un-trusted) rather than
 * defaulting to 0 and silently allowing a comparison.
 */
export function rankOf(roleName: string | null | undefined): number | null {
  if (!roleName) return null;
  const rank = ROLE_RANK[roleName];
  return rank === undefined ? null : rank;
}

/**
 * Throw `FORBIDDEN` if `actorRoleName` may not assign `targetRoleName` (the
 * privilege-escalation guard). Fail-closed on any unrecognized role. Kept here
 * (a dependency-light module) so it is directly unit-testable and reusable.
 */
export function assertCanAssignRole(
  actorRoleName: string | null | undefined,
  targetRoleName: string | null | undefined,
): void {
  const actorRank = rankOf(actorRoleName);
  const targetRank = rankOf(targetRoleName);
  if (actorRank === null || targetRank === null) {
    throw new AppError('FORBIDDEN', 'Role assignment denied (unrecognized role)', 403);
  }
  if (targetRank > actorRank) {
    throw new AppError('FORBIDDEN', 'You cannot assign a role more privileged than your own', 403);
  }
}
