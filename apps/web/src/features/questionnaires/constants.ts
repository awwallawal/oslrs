/**
 * Questionnaire Feature Constants
 *
 * Centralized constants for the questionnaires feature to avoid magic numbers
 * and ensure consistency across components.
 */

/**
 * Number of consecutive ODK health check failures before showing warning banner.
 * When ODK Central is unreachable for this many consecutive health checks,
 * a prominent warning banner is displayed on the Super Admin dashboard.
 *
 * @see AC4 - ODK Health Warning Banner
 */
export const ODK_FAILURE_THRESHOLD = 3;
