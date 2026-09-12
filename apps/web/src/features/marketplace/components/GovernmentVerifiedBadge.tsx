import { useState } from 'react';
import { BadgeCheck, Info } from 'lucide-react';
import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
} from '../../../lib/trust-claims';

/**
 * [AI-Review][Low] 2026-08-18 — `compact` is meaningless in interactive mode (the
 * button branch never reads it), so the union makes that unrepresentable instead of
 * silently ignoring the prop. A comment saying "only meaningful with
 * interactive={false}" relies on the caller reading it; this reds at compile time.
 */
type GovernmentVerifiedBadgeProps =
  | {
      showInfo?: boolean;
      /** When false, renders a static span (safe inside links/cards). Default: true */
      interactive?: true;
      compact?: never;
    }
  | {
      showInfo?: boolean;
      interactive: false;
      /**
       * Story 13-38 AC5 — the redesigned card's trust slot is a compact top-right
       * pill; the default size crowds the identity line at grid density. Palette
       * and wording are unchanged, so one badge still reads as one badge everywhere.
       */
      compact?: boolean;
    };

export function GovernmentVerifiedBadge({
  showInfo = false,
  interactive = true,
  compact = false,
}: GovernmentVerifiedBadgeProps) {
  const [infoExpanded, setInfoExpanded] = useState(showInfo);

  if (!interactive) {
    return (
      <span
        data-testid="government-verified-badge"
        className={`inline-flex shrink-0 items-center rounded-full bg-green-100 text-green-700 border border-green-200 ${
          compact ? 'gap-1 px-2 py-0.5 text-xs font-semibold' : 'gap-1.5 px-3 py-1 text-sm font-medium'
        }`}
      >
        {/*
          The wording NEVER shortens to a bare "Verified" — the honesty discipline
          (R1) is that a badge must say WHO verified. Compact changes size only.
        */}
        <BadgeCheck className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        Government Verified
      </span>
    );
  }

  return (
    <div data-testid="government-verified-badge">
      <button
        type="button"
        onClick={() => setInfoExpanded(!infoExpanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700 border border-green-200 cursor-pointer hover:bg-green-200 transition-colors"
        aria-expanded={infoExpanded}
        aria-label="Government Verified - click for details"
      >
        <BadgeCheck className="w-4 h-4" />
        Government Verified
        <Info className="w-3 h-3 ml-0.5 opacity-60" />
      </button>

      {infoExpanded && (
        <div
          data-testid="verification-info"
          className="mt-2 p-3 text-xs rounded-lg bg-green-50 border border-green-100 text-green-800 space-y-1.5"
        >
          {/*
            [AI-Review][Low] 2026-08-18 — this panel used to read "NIN validated and
            identity confirmed". It is not true and it is the exact claim the R1
            honesty discipline forbids: there is NO NIMC path anywhere in this
            system, and NIN validation is FORMAT-ONLY (`^\d{11}$`) because a mod-11
            checksum rejects ~74% of real NINs. What the badge actually attests is
            an Assessor's approval of the registration (it is derived from
            `fraud_detections.assessor_resolution = 'final_approved'`), so that is
            what it now says. Overstating here burns the same credibility that
            13-58's association tiers will need. Copy is Paige's to refine.
          */}
          {/*
            [AI-Review][High] 2026-09-09 — these lists MOVED to
            `lib/trust-claims.ts` and are rendered from there. The strings are
            byte-identical to what this panel already said; nothing was reworded.
            The point is that `VerifyWorkerPage` and `GuideVerifyWorkerPage` were
            still telling the public "Identity verified by government" long after
            this panel stopped, and a second copy of a corrected claim is a third
            copy waiting to happen.
          */}
          <p className="font-medium">This badge means:</p>
          <ul className="list-disc list-inside space-y-0.5 text-green-700">
            {GOVERNMENT_VERIFICATION_MEANS.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
          <p className="font-medium mt-2">What it does NOT mean:</p>
          <ul className="list-disc list-inside space-y-0.5 text-green-700">
            {GOVERNMENT_VERIFICATION_DOES_NOT_MEAN.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
