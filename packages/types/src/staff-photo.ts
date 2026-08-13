/**
 * Story 13-60 — staff photo provenance.
 *
 * THE DEFECT THIS VOCABULARY EXISTS TO CLOSE: `auth.service.activateAccount`
 * caught a selfie failure, set `selfieData = null` and completed activation
 * silently. "photo saved", "person skipped the step" and "the upload threw and
 * we swallowed it" all produced the SAME three NULL columns and the SAME
 * silence — so nobody could tell an enumerator their ID card would not exist
 * until they were standing at a household door with nothing to show.
 *
 * Distinguishability is the whole point. Do not collapse these back into a
 * boolean `hasPhoto`.
 */

/**
 * What happened to this person's photo. NULL in the database (i.e. absent here)
 * means the photo step never applied to them at all — back-office activations
 * skip the selfie block entirely (`auth.service.ts`), as do accounts created
 * before this column existed. **A NULL is not a failure and must never be
 * counted as one.**
 */
export const PHOTO_STATUS = {
  /** Processed and stored. `photo_source` says which path produced it. */
  SAVED: 'saved',
  /** The person deliberately declined the step. `SkipForward` exists by design. */
  SKIPPED: 'skipped',
  /** They tried, it threw, and activation completed anyway. They were told. */
  FAILED: 'failed',
} as const;

export type PhotoStatus = (typeof PHOTO_STATUS)[keyof typeof PHOTO_STATUS];

export const PHOTO_STATUSES: readonly PhotoStatus[] = [
  PHOTO_STATUS.SAVED,
  PHOTO_STATUS.SKIPPED,
  PHOTO_STATUS.FAILED,
] as const;

/**
 * WHICH PATH produced the stored photo — or, when the attempt FAILED, which
 * path was attempted. It is not "null whenever there is no photo": a failed
 * upload records `upload`, because "they tried to upload and we lost it" is
 * more than "they have no photo", and that difference is the whole story.
 *
 * ⛔ NON-NEGOTIABLE (Story 13-60 AC6.2): an uploaded file must NEVER be written
 * into a `live_selfie_*` column without this discriminator. Storing an upload
 * under a name that asserts "live" recreates the exact defect the same story
 * fixes one column over (`liveness_score` holding a sharpness ratio) — and it
 * would be self-inflicted, because we know at write time which path we are on.
 *
 * ⚠️ REPORTED, NOT VERIFIED. The value is whatever the client sent —
 * `selfieSource` on activation, the `source` multipart field on
 * `POST /users/selfie`. The server cannot tell a webcam frame from a file, so
 * this records a CLAIM about provenance, not a proven property. Any surface
 * that displays it must say so (the staff table labels it "(reported)"), and
 * nothing may be gated on it as though it were evidence — which is safe today
 * precisely because live capture buys no anti-fraud property either.
 */
export const PHOTO_SOURCE = {
  /** Webcam capture via `LiveSelfieCapture`. The default and preferred path. */
  LIVE_CAPTURE: 'live_capture',
  /** An existing image file the person chose (e.g. a passport photograph). */
  UPLOAD: 'upload',
} as const;

export type PhotoSource = (typeof PHOTO_SOURCE)[keyof typeof PHOTO_SOURCE];

export const PHOTO_SOURCES: readonly PhotoSource[] = [
  PHOTO_SOURCE.LIVE_CAPTURE,
  PHOTO_SOURCE.UPLOAD,
] as const;

export function isPhotoSource(value: unknown): value is PhotoSource {
  return typeof value === 'string' && (PHOTO_SOURCES as readonly string[]).includes(value);
}

/**
 * The outcome of the photo step, as returned to the person who just activated.
 * `failureReason` is present only for {@link PHOTO_STATUS.FAILED} and is the
 * message we show them — the activation succeeded, but they need to know the
 * photo did not, and that they can add one later without being re-invited.
 */
export interface PhotoOutcome {
  status: PhotoStatus | null;
  source: PhotoSource | null;
  failureReason: string | null;
}

/**
 * Story 13-60 AC3 — the operator's pre-field-day view, folded into the ops
 * digest. Counts only ACTIVE staff in field roles: a back-office account with
 * no photo is correct, not a finding, and a deactivated account is nobody's
 * problem.
 */
export interface FieldStaffPhotoHealth {
  /** Active field staff in total — the denominator. */
  activeFieldStaff: number;
  /** …of whom hold a usable ID-card photo (`live_selfie_id_card_url IS NOT NULL`). */
  withPhoto: number;
  /** …of whom have no photo on file, for ANY reason. `withPhoto + missingPhoto = activeFieldStaff`. */
  missingPhoto: number;
  /** …of whom tried and were failed by the system. The subset that is OUR fault. */
  failed: number;
  /** …of whom declined the step. Their choice, recorded, not an error. */
  skipped: number;
  /** Of those WITH a photo, how many came from an upload rather than live capture (AC6.3). */
  fromUpload: number;
}
