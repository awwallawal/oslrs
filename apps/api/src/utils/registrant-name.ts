/**
 * Story 9-38 — single source of truth for deriving a public-user account
 * display name from a respondent's identity columns.
 *
 * Previously the join+fallback logic was triplicated (submitWizard wiring, the
 * provisioning service, and the backfill script) with subtly different
 * fallbacks ('Registrant' vs the given name). Consolidated here so all account
 * provisioning paths produce identical names and cannot drift.
 */
export function buildRegistrantFullName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return (
    [firstName, lastName]
      .filter((p): p is string => !!p && p.trim().length > 0)
      .join(' ')
      .trim() || 'Registrant'
  );
}
