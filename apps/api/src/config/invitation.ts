/**
 * Staff invitation window — ONE number, because it was previously written FIVE times.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * The invitation lifetime was hardcoded as `24` in five places across two files:
 * three `expiresInHours: 24` sites in `staff.service.ts` (which set the text a
 * human reads in the email) and two `getHours() + 24` sites in `auth.service.ts`
 * (which actually ENFORCE it).
 *
 * Those two groups answer different questions — "what does the email promise?"
 * and "when does the token stop working?" — and nothing tied them together. Change
 * one and the system lies: an email that says 24 hours against a check that allows
 * 48 wastes a day of everyone's goodwill; the reverse locks people out early while
 * telling them they have time. Neither failure raises an error, and neither is
 * visible until someone is standing in a room unable to log in.
 *
 * ⚠️ SO: import this constant. Do not write the number.
 *
 * ── Why 48 (changed from 24 on 2026-09-05) ───────────────────────────────────
 * Awwal's call, and the reason is operational rather than technical: the field
 * trial is provisioned on a FRIDAY. A 24-hour window expires on Saturday evening,
 * before anyone is back at a desk, so the whole cohort would arrive on Monday to
 * dead links and the day would start with rate-limited resend calls
 * (`RESEND_LIMIT_TTL` is itself 24h).
 *
 * The window is a usability/security trade, not a constant of nature: longer means
 * a valid activation token sits in an inbox for longer. 48h keeps a weekend intact
 * while staying far short of anything that would make a leaked mailbox a standing
 * risk. If it ever needs to be longer than a weekend, the right answer is almost
 * certainly self-service re-request, not a bigger number here.
 *
 * ⚠️ The change is RETROACTIVE for anyone already invited, because the check is
 * `invited_at + WINDOW` evaluated at validation time — not a value stamped on the
 * row at creation. Deploying this extends invitations that have not yet expired.
 * It cannot revive one that already has.
 */

/**
 * Hours a staff invitation token remains valid, measured from `users.invited_at`.
 *
 * Used by BOTH the enforcement check (`auth.service.ts`) and the copy in the
 * invitation email (`staff.service.ts` → `EmailService`), so the promise and the
 * behaviour cannot drift apart.
 */
export const INVITATION_EXPIRY_HOURS = 48;
