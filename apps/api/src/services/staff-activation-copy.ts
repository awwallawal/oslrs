/**
 * Story 13-59 (AC1) — the role-specific copy for the activation-completion
 * email, in ONE place, keyed by role.
 *
 * ⚠️ AC1.2 is the load-bearing rule here: **a role with no copy must fail
 * loudly, never send a blank body.** A `Record<UserRole, …>` gives us the
 * compile-time half of that (adding a role to the enum breaks the build until
 * copy exists), and `getStaffActivationCopy` gives us the runtime half, because
 * `roleName` arrives as a plain string from `roles.name` in the database and
 * the type system cannot see it.
 *
 * Why an email is worth this much care: for a field officer walking into an LGA
 * office, this is often the only thing they can show, and it is the only
 * durable record of what role they hold.
 */
import { AppError } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';

export interface StaffActivationCopy {
  /**
   * AC1's "sentence that matters" — the one line that tells this person what
   * they can now do. Rendered as the lead paragraph.
   */
  headline: string;
  /**
   * Role-specific follow-on lines, in order. Empty for roles whose headline
   * says everything (nothing is padded to look substantial).
   */
  details: string[];
}

/**
 * The one instruction every field officer must act on before their first day.
 *
 * AC4.2 names what the withdrawn attachment design was actually buying:
 * OFFLINE ACCESS — an enumerator standing in an LGA office with no data. A
 * modal does not preserve that by existing; it preserves it only if the
 * download actually happens, on the device they will carry. This sentence is
 * the email's half of that, and AC7's persistent modal is the app's half.
 */
const DOWNLOAD_INSTRUCTION =
  'Log in and download your ID card and field briefing BEFORE you go to the field — ' +
  'once they are on your phone you can open them with no network.';

/**
 * 13-4 R8, compressed to one line. The long form is §1 of the field briefing.
 */
const READ_OUT_RULE =
  'DO NOT READ OUT a registration number until the app has shown you one. ' +
  'If the screen says the entry has not finished uploading, no number exists yet — ' +
  'tell the person it is being issued and give it to them from Sync Status once it is.';

/**
 * ⚠️ Typed as a FULL record over UserRole on purpose. Adding a role to the enum
 * without adding copy here is a compile error, which is the cheapest possible
 * place to catch it. `public_user` is present but explicitly `null`: citizens
 * never travel this path, and giving them a fallback sentence would be a silent
 * pass where AC1.2 wants a loud stop.
 */
const ACTIVATION_COPY: Record<UserRole, ((lgaName?: string | null) => StaffActivationCopy) | null> = {
  [UserRole.ENUMERATOR]: (lgaName) => ({
    headline: `You are cleared for field registration in ${lgaName || 'your assigned Local Government Area'}.`,
    details: [READ_OUT_RULE, DOWNLOAD_INSTRUCTION],
  }),

  /*
   * ⚠️ NOT in AC1's table — added deliberately. Supervisor is a FIELD_ROLE
   * (`packages/types/src/roles.ts`), so it activates through this exact path
   * and would otherwise hit the loud failure below on a real person's
   * activation. The table was written from the five roles in front of the
   * author; the enum is the authority on who can actually get here.
   */
  [UserRole.SUPERVISOR]: (lgaName) => ({
    headline: `You can now supervise field registration in ${lgaName || 'your assigned Local Government Area'}.`,
    details: [
      'You can see your team\'s progress, review fraud alerts, and message your enumerators.',
      DOWNLOAD_INSTRUCTION,
    ],
  }),

  [UserRole.DATA_ENTRY_CLERK]: () => ({
    headline: 'You can now enter registrations from the office.',
    details: [DOWNLOAD_INSTRUCTION],
  }),

  [UserRole.VERIFICATION_ASSESSOR]: () => ({
    headline: 'You can now review and score submissions.',
    details: [],
  }),

  [UserRole.GOVERNMENT_OFFICIAL]: () => ({
    headline: 'You now have read access to registry reports.',
    details: [],
  }),

  [UserRole.SUPER_ADMIN]: () => ({
    headline: 'You have full administrative access.',
    details: [
      // AC1's table: "+ a security line — this one earns it".
      'Security: this account can read and export citizen data for the whole State. ' +
        'Never share your password, keep two-factor authentication enabled, and sign out on shared machines.',
    ],
  }),

  // Citizens do not activate. See the note on ACTIVATION_COPY above.
  [UserRole.PUBLIC_USER]: null,
};

/**
 * The roles that have copy — exported so a test can assert coverage without
 * reaching into the map's internals.
 */
export const ACTIVATION_COPY_ROLES: readonly UserRole[] = (
  Object.keys(ACTIVATION_COPY) as UserRole[]
).filter((role) => ACTIVATION_COPY[role] !== null);

/**
 * Resolve the copy for a role.
 *
 * @throws AppError when the role has no copy. AC1.2 — loud, never blank. The
 *   caller (`auth.service.ts`) already treats ANY failure of this email as
 *   non-fatal to the activation (AC2.2), so throwing here costs the person
 *   their email, never their account.
 */
export function getStaffActivationCopy(
  roleName: string,
  ctx: { lgaName?: string | null },
): StaffActivationCopy {
  const build = ACTIVATION_COPY[roleName as UserRole];

  if (!build) {
    throw new AppError(
      'STAFF_ACTIVATION_COPY_MISSING',
      `No activation copy is defined for role "${roleName}". ` +
        'Add it to ACTIVATION_COPY in staff-activation-copy.ts — a staff member ' +
        'has just activated and would otherwise receive a blank email.',
      500,
      { roleName },
    );
  }

  return build(ctx.lgaName);
}
