/**
 * Story 13-59 — the ONE formatter for a staff member's human-facing ID.
 *
 * This string is what a field officer reads off their card when an LGA office
 * asks who they are, and it is now also what the activation email tells them
 * their ID is. Those two must agree: an email that disagrees with the printed
 * card is two identities for one person, which is worse than no ID at all
 * because it invites a challenge the officer cannot win.
 *
 * Before this story the format lived inline in `id-card.service.ts` as
 * `OSLSR-${data.staffId.substring(0, 8).toUpperCase()}`, i.e. in exactly one
 * place — which is fine right up until the second surface needs it. It is
 * extracted here rather than copied there (13-55: five hand-written copies of
 * one operation), so a future change to the format moves both surfaces or
 * neither.
 */

/**
 * Render a user's UUID as the staff ID printed on their card.
 *
 * @param userId a UUIDv7 from `users.id`
 * @returns e.g. `OSLSR-018E5F2A`
 */
export function formatStaffId(userId: string): string {
  return `OSLSR-${userId.substring(0, 8).toUpperCase()}`;
}
