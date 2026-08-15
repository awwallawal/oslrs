/**
 * THE BY-NAME INGESTION CONTRACT — the single map that decides which form
 * answers become respondent fields.
 *
 * Lived inside `submission-processing.service.ts` until Story 13-57. It moved
 * to its own module for one reason: AC5's publish/pin guard must assert against
 * THIS map rather than a hand-written list of field names, so the guard cannot
 * drift from the consumer it protects — and importing it from the ingestion
 * service would have pulled db, queues, email and audit into the form-publish
 * and settings-write paths. Nothing here has changed; `submission-processing.service.ts`
 * re-exports it, so every existing importer is untouched.
 *
 * Pure data. No imports, deliberately.
 *
 * ⚠️ ADDING A KEY WIDENS WHAT FORMS MAY BE CALLED. Adding a VALUE (a new
 * consumer field) narrows what a form must carry, because `ingestion-contract.ts`
 * derives its required set from the values here. Read that file before editing
 * this one.
 */

/**
 * Convention-based field mapping from rawData question names to respondent fields.
 * Supports both snake_case (XLSForm convention) and camelCase variants.
 */
export const RESPONDENT_FIELD_MAP: Record<string, string> = {
  // NIN (REQUIRED)
  'nin': 'nin',
  'national_id': 'nin',
  // Name (supports XLSForm, camelCase, and snake_case conventions)
  'first_name': 'firstName',
  'firstName': 'firstName',
  'firstname': 'firstName',
  'last_name': 'lastName',
  'lastName': 'lastName',
  'surname': 'lastName',
  // Personal
  'date_of_birth': 'dateOfBirth',
  'dob': 'dateOfBirth',
  'phone': 'phoneNumber',
  'phone_number': 'phoneNumber',
  // Location
  'lga': 'lgaId',
  'lga_id': 'lgaId',
  // Consent
  'consent_marketplace': 'consentMarketplace',
  'consent_enriched': 'consentEnriched',
};
