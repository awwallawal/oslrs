import { Link } from 'react-router-dom';
import { Camera, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { FIELD_ROLES } from '@oslsr/types';
import { fetchProfile } from '../api/profile.api';

/**
 * Story 13-60 AC2.2 — the way back, where they will actually see it.
 *
 * THE PROBLEM THIS SOLVES: a field officer whose photo failed (or who skipped
 * the step) has no ID card, and until this banner existed nothing anywhere told
 * them so. They found out at a household door, holding nothing that said they
 * were genuine. The remedy already existed — `/profile-completion` is an
 * ordinary authenticated page — it was simply unreachable unless you knew the
 * URL.
 *
 * ⚠️ NOT a magic link. The story pointed at 9-12's magic-link self-update, but
 * that path exists because RESPONDENTS have no password. Staff who reached this
 * banner are, by definition, logged in — so the reuse that avoids a second path
 * is the EXISTING authenticated one, not a token flow they do not need. Sending
 * a magic link here would have been the second path, not the avoidance of one.
 */
export function MissingPhotoBanner() {
  const { data: profile } = useQuery({
    queryKey: ['users', 'profile'],
    queryFn: fetchProfile,
    // Cheap and stable — this only changes when they add a photo.
    staleTime: 5 * 60 * 1000,
  });

  // No data yet, or they already have a printable photo → say nothing.
  if (!profile || profile.liveSelfieIdCardUrl) return null;

  /*
   * ⚠️ FIELD ROLES ONLY, as a positive allow-list rather than an exclusion.
   *
   * Everyone else legitimately has no photo: back-office staff never take a
   * selfie (activation skips the step for them), and PUBLIC USERS — who share
   * this same DashboardLayout — are citizens with no staff ID card at all. An
   * exclusion list would have shipped this banner to every respondent on the
   * marketplace the moment somebody added a role. Nagging people about a step
   * that does not exist for them is how a banner becomes wallpaper.
   *
   * ⚠️ IMPORTED, NOT RETYPED. This list was a hand-copied string literal, and
   * `getFieldStaffPhotoHealth` builds the operator's count from the canonical
   * `FIELD_ROLES` in `@oslsr/types`. Two copies of "who is a field officer"
   * drift the first time a role is added: the digest would start counting
   * people whose own dashboard never nags them. The operator's list and the
   * person's own prompt have to mean the same thing, so they read the same
   * constant.
   */
  if (!profile.roleName || !(FIELD_ROLES as readonly string[]).includes(profile.roleName)) {
    return null;
  }

  const failed = profile.photoStatus === 'failed';

  return (
    // Owns its own spacing: DashboardLayout deliberately provides no content
    // padding (every page adds its own p-6), and a wrapper div in the layout
    // would leave a visible gap on every page where this renders null.
    <div
      role="status"
      className={`mx-6 mt-6 rounded-lg border p-4 ${
        failed ? 'bg-warning-100 border-warning-600' : 'bg-neutral-50 border-neutral-300'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2 items-start flex-1">
          {failed ? (
            <AlertCircle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
          ) : (
            <Camera className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-medium text-neutral-900">
              {failed ? 'Your photo did not save' : 'Your staff ID card needs a photo'}
            </p>
            <p className="text-sm text-neutral-700">
              {failed
                ? 'We could not store the photo you took during activation, so your ID card cannot be printed yet.'
                : 'Without a photo we cannot print your staff ID card — the thing a household looks at to know you are genuine.'}
            </p>
          </div>
        </div>
        <Link
          to="/profile-completion"
          className="shrink-0 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors text-center"
        >
          Add your photo
        </Link>
      </div>
    </div>
  );
}

export default MissingPhotoBanner;
