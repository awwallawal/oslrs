/**
 * Story 9-63 (Task 2 / AC1) — shared notification category vocabulary + the
 * subject→category classifier.
 *
 * This is the SINGLE source of truth used by the NotificationMeter chokepoint,
 * the (throwaway) `_diagnose-email-usage.ts` diagnostic, and the future
 * dashboard / Telegram digest. Keeping the mapping in one place means every
 * surface buckets a given send identically.
 *
 * The mapping is lifted verbatim from `apps/api/scripts/_diagnose-email-usage.ts`
 * (the reference classifier) so the diagnostic and the live counter agree.
 */

/** Email/SMS categories, keyed by the subject lines emitted across the codebase. */
export type NotificationCategory =
  | 'magiclink-login'
  | 'magiclink-wizard-resume'
  | 'pending-nin-reminder'
  | 'supplemental-survey'
  | 'duplicate-registration'
  | 'password-reset'
  | 'staff-invitation'
  | 'payment-notification'
  | 'dispute'
  | 'backup-success'
  | 'backup-FAILURE'
  | 'health-alert-digest'
  | 'reengagement-blast'
  | 'notification-digest'
  | 'registration-status'
  | 'other';

/**
 * Map an email subject line to a category. Ordered most-specific first.
 * Subjects are sourced from: magic-link.service.ts:getCopyForPurpose,
 * email.service.ts, backup.worker.ts, alert.service.ts,
 * registration-status.service.ts, and the blast scripts.
 */
export function classifyEmailSubject(subjectRaw: string): NotificationCategory {
  const s = (subjectRaw || '').toLowerCase();
  if (s.includes('daily backup failed') || s.includes('backup failed')) return 'backup-FAILURE';
  if (s.includes('daily backup completed')) return 'backup-success';
  if (s.includes('system health digest')) return 'health-alert-digest';
  if (s.includes('sign in to your')) return 'magiclink-login';
  if (s.includes('continue your') && s.includes('registration')) return 'magiclink-wizard-resume';
  if (s.includes('add your nin')) return 'pending-nin-reminder';
  if (s.includes('one more step') || s.includes('skills profile')) return 'supplemental-survey';
  if (s.includes('registration attempt detected')) return 'duplicate-registration';
  if (s.includes('your oyo state skills registry status')) return 'registration-status';
  if (s.includes('password reset')) return 'password-reset';
  if (s.includes("you've been invited") || s.includes('invited to join')) return 'staff-invitation';
  if (s.includes('payment recorded')) return 'payment-notification';
  if (s.includes('dispute')) return 'dispute';
  if (s.includes('you have') && s.includes('notification')) return 'notification-digest';
  return 'other';
}

/** Categories that are user/public-triggered → candidate abuse vectors (AC5). */
export const PUBLIC_TRIGGERED_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'magiclink-login',
  'magiclink-wizard-resume',
  'pending-nin-reminder',
  'supplemental-survey',
  'duplicate-registration',
  'registration-status',
]);
