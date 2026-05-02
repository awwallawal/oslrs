/**
 * Shared types for the input-normalisation layer (prep-input-sanitisation-layer).
 *
 * Each normaliser returns a canonical value plus a list of structured warning
 * codes. Warnings are non-blocking — the calling boundary is expected to merge
 * them into `respondents.metadata.normalisation_warnings` (or equivalent) for
 * audit, while still accepting the canonical value.
 *
 * Warning codes are stable strings (suitable for filtering / aggregation in the
 * audit-log viewer). Document new codes in README.md when added.
 */

export interface NormaliseResult {
  value: string;
  warnings: string[];
}

export interface NormaliseDateResult {
  value: Date | null;
  warnings: string[];
}
