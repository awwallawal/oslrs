/**
 * User Roles Seed Data
 * Matches UserRole enum in @oslsr/types
 * ADR-017: Database Seeding Strategy
 */

export const USER_ROLES = [
  {
    name: 'super_admin',
    description: 'Full system access. Can manage all users, forms, and system settings.',
  },
  {
    name: 'supervisor',
    description: 'Manages assigned enumerators. Reviews fraud alerts and verifies submissions.',
  },
  {
    name: 'enumerator',
    description: 'Field data collector. Conducts surveys and submits data via mobile PWA.',
  },
  {
    name: 'data_entry_clerk',
    description: 'Digitizes paper forms. High-volume data entry with keyboard-optimized interface.',
  },
  {
    name: 'verification_assessor',
    description: 'Audits flagged submissions. Final approval authority for high fraud-score records.',
  },
  {
    name: 'government_official',
    description: 'Read-only access to dashboards and reports. Policy oversight role.',
  },
  {
    name: 'public_user',
    description: 'Self-registered public user. Can complete surveys and manage own profile.',
  },
] as const;

export type RoleName = typeof USER_ROLES[number]['name'];
