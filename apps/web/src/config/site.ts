/**
 * Centralized site configuration derived from environment variables.
 *
 * Cascading defaults: set VITE_SITE_DOMAIN and everything else derives automatically.
 * Individual overrides (VITE_SUPPORT_EMAIL, VITE_PUBLIC_URL) are optional.
 *
 * @see docs/DOMAIN-MIGRATION.md for the migration checklist.
 */

export const SITE_DOMAIN = import.meta.env.VITE_SITE_DOMAIN || 'oyotradeministry.com.ng';

export const publicUrl = import.meta.env.VITE_PUBLIC_URL || `https://${SITE_DOMAIN}`;

export const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || `support@${SITE_DOMAIN}`;

/** Construct any role-based email from the site domain (e.g., 'tech', 'report') */
export function siteEmail(prefix: string): string {
  return `${prefix}@${SITE_DOMAIN}`;
}
