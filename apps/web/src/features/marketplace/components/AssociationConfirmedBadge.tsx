import { useState } from 'react';
import { Users, Info } from 'lucide-react';

/**
 * AssociationConfirmedBadge — Story 13-58, tier-1 trust provenance.
 *
 * Renders "[Association] — confirmed member" for a worker a named trade association
 * vouched for.
 *
 * ⚠️ R1 IS LOCKED. This badge must NEVER read as a bare "✓ Verified". There is no
 * NIMC or identity-validation path anywhere in this system; NIN validation is
 * FORMAT-ONLY, and for an association import the NIN was proxy-transcribed by the
 * association head. Overstating here burns the association's credibility along with
 * ours — and naming the accountable body is the STRONGER signal anyway, because an
 * employer can chase AFAN and cannot chase a checkmark.
 *
 * ⚠️ THE CALLER DECIDES WHETHER TO RENDER, ON THE PRESENCE OF THE STORED NAME —
 * never on `source`. AC4 was corrected at adjudication on 2026-09-07 because the
 * AFAN import MATCHED eleven people who had already registered themselves: their
 * source is `public` while a named association genuinely vouched for them. This
 * component therefore takes a REQUIRED non-null name; "no vouch" is expressed by
 * not rendering it at all, so there is no code path here that can assert a vouch
 * while naming nobody.
 *
 * AC5 — it sits beside `GovernmentVerifiedBadge` in the trust hierarchy and must
 * not be mistaken for it. The distinction is carried by SHAPE as well as colour
 * (a different icon, different words, indigo rather than green), so the two stay
 * separable for a colour-blind reader rather than relying on hue alone.
 */

type AssociationConfirmedBadgeProps =
  | {
      /** The accountable body's name. Required: a badge with no body names nobody. */
      associationName: string;
      showInfo?: boolean;
      /** When false, renders a static span (safe inside links/cards). Default: true */
      interactive?: true;
      compact?: never;
    }
  | {
      associationName: string;
      showInfo?: boolean;
      interactive: false;
      /** Compact pill for the card's trust slot at grid density (AC5). */
      compact?: boolean;
    };

/** AC3 — what the badge means, in one sentence, wherever it is announced. */
export function associationDisclosure(associationName: string): string {
  return `Confirmed as a member by ${associationName}. Identity not independently verified.`;
}

export function AssociationConfirmedBadge({
  associationName,
  showInfo = false,
  interactive = true,
  compact = false,
}: AssociationConfirmedBadgeProps) {
  const [infoExpanded, setInfoExpanded] = useState(showInfo);

  const label = `${associationName} — confirmed member`;
  const disclosure = associationDisclosure(associationName);

  if (!interactive) {
    return (
      <span
        data-testid="association-confirmed-badge"
        // ⚠️ [AI-Review][Medium] 2026-09-08 — `role="img"` is what makes the AC3
        // disclosure REACH a screen reader. Without a role this is a bare <span>
        // (role=generic), and ARIA does not permit an accessible name on a generic
        // element: `aria-label` here is ignored by assistive tech, and `title` is a
        // mouse-only tooltip. So the card surface — the PRIMARY one, the whole
        // browse grid — announced "AFAN — confirmed member" and none of the
        // "identity not independently verified" half. A disclosure the sighted
        // reader gets on hover and the screen-reader user never gets is exactly the
        // overstatement R1 locks against, aimed at the people least able to check.
        //
        // With role="img" the label is announced INSTEAD of the inner text, which is
        // why the label names the body too ("Confirmed as a member by AFAN…") — no
        // information is lost in the swap.
        role="img"
        aria-label={disclosure}
        title={disclosure}
        // `min-w-0` (not `shrink-0`) so the pill can ELLIPSIZE inside the card's
        // trust slot. A body name may be up to
        // MARKETPLACE_ASSOCIATION_NAME_MAX_LEN characters; unshrinkable, that pushes
        // the identity line out of the grid cell and deforms the whole row.
        className={`inline-flex min-w-0 max-w-full items-center rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 ${
          compact ? 'gap-1 px-2 py-0.5 text-xs font-semibold' : 'gap-1.5 px-3 py-1 text-sm font-medium'
        }`}
      >
        <Users className={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />
        {/*
          `truncate` keeps a long body name from breaking the card's trust slot and
          pushing the identity line out of the grid cell. The full string is always
          reachable via the title/aria-label above.
        */}
        <span data-testid="association-confirmed-badge-label" className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <div data-testid="association-confirmed-badge-interactive">
      <button
        type="button"
        onClick={() => setInfoExpanded(!infoExpanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-colors"
        aria-expanded={infoExpanded}
        aria-label={disclosure}
        title={disclosure}
        data-testid="association-confirmed-badge"
      >
        <Users className="w-4 h-4 shrink-0" />
        {label}
        <Info className="w-3 h-3 ml-0.5 opacity-60" />
      </button>

      {infoExpanded && (
        <div
          data-testid="association-confirmation-info"
          className="mt-2 p-3 text-xs rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-800 space-y-1.5"
        >
          {/*
            The "does NOT mean" half is not boilerplate — it is the whole reason this
            badge is allowed to exist. It says precisely what the platform knows
            (a named body put this person on its member list) and precisely what it
            does not (anything about their identity), so the badge cannot be read as
            a government check by someone skimming a card.
          */}
          <p className="font-medium">This badge means:</p>
          <ul className="list-disc list-inside space-y-0.5 text-indigo-700">
            <li>{associationName} listed this person as one of its members</li>
            <li>That association is accountable for the claim, by name</li>
          </ul>
          <p className="font-medium mt-2">What it does NOT mean:</p>
          <ul className="list-disc list-inside space-y-0.5 text-indigo-700">
            <li>We have not confirmed this identity with NIMC — no such check exists here</li>
            <li>Any NIN on file was transcribed on this person&apos;s behalf, not proven</li>
            <li>A State Assessor has not reviewed this registration</li>
            <li>We have not tested their skills and do not guarantee work quality</li>
          </ul>
        </div>
      )}
    </div>
  );
}
