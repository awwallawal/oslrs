import { UserRole } from './constants.js';

/**
 * Human-readable display names for all user roles.
 * Single source of truth — used by both frontend and backend.
 */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.SUPERVISOR]: 'Supervisor',
  [UserRole.ENUMERATOR]: 'Enumerator',
  [UserRole.DATA_ENTRY_CLERK]: 'Data Entry Clerk',
  [UserRole.VERIFICATION_ASSESSOR]: 'Verification Assessor',
  [UserRole.GOVERNMENT_OFFICIAL]: 'Government Official',
  [UserRole.PUBLIC_USER]: 'Public User',
};

/**
 * Array of all UserRole enum values.
 * Use for validation, iteration, and test assertions.
 */
export const ALL_ROLES: readonly UserRole[] = Object.values(UserRole);

/**
 * Roles that require LGA (Local Government Area) assignment.
 * Field roles go through the full 5-step activation wizard.
 */
export const FIELD_ROLES: readonly UserRole[] = [
  UserRole.ENUMERATOR,
  UserRole.SUPERVISOR,
  UserRole.DATA_ENTRY_CLERK,
] as const;

/**
 * Back-office roles that use a simplified activation wizard (password only).
 * These roles don't need selfie capture, bank details, or next of kin during activation.
 * Bank details can be added later via profile editing for Epic 6 (Staff Remuneration).
 */
export const BACK_OFFICE_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.GOVERNMENT_OFFICIAL,
  UserRole.VERIFICATION_ASSESSOR,
] as const;

/**
 * Check if a role string is a back-office role.
 */
export function isBackOfficeRole(role: string): boolean {
  return (BACK_OFFICE_ROLES as readonly string[]).includes(role);
}

/**
 * Get the human-readable display name for a role string.
 * Accepts plain strings (not just UserRole) because API responses
 * return role names as strings.
 *
 * Falls back to sentence-casing for unknown values.
 */
export function getRoleDisplayName(role: string): string {
  const known = ROLE_DISPLAY_NAMES[role as UserRole];
  if (known) return known;

  // Sentence-case fallback: "unknown_role" → "Unknown Role"
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
