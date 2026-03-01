/**
 * Remuneration formatting utilities.
 * Shared across payment history, batch tables, and dialogs.
 */

/** Format kobo amount to Naira display string (e.g. 5000000 → ₦50,000.00) */
export function formatNaira(kobo: number): string {
  return `\u20A6${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}
