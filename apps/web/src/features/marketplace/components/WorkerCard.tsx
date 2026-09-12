import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/card';
import { MapPin, ArrowRight, Star } from 'lucide-react';
import { GovernmentVerifiedBadge } from './GovernmentVerifiedBadge';
import { AssociationConfirmedBadge } from './AssociationConfirmedBadge';
import { TradeAvatar } from '../../../components/common/TradeAvatar';
import {
  experienceStatFor,
  skillLabelForSlug,
  type MarketplaceSearchResultItem,
} from '@oslsr/types';

interface WorkerCardProps {
  profile: MarketplaceSearchResultItem;
}

/** Story 13-28 — how many skill chips show on a card before we collapse to "+N more". */
const MAX_CARD_SKILLS = 3;

/**
 * WorkerCard — redesigned in Story 13-38 (AC5 + AC7 + AC8).
 *
 * LOCKED design decisions this implements (Awwal + Sally, 2026-07-19; visual spec
 * `docs/design/marketplace-card-13-38.html`):
 *  - NO display name, NO photo. `/marketplace` browse is public and
 *    unauthenticated; the full profile + contact sit behind employer login. Warmth
 *    comes from the trade-glyph avatar, not initials.
 *  - The trust slot is top-right (AC5). It now holds up to TWO pills: the
 *    government check and, from Story 13-58, the association provenance badge.
 *    They are different claims from different authorities and stack rather than
 *    compete — see `AssociationConfirmedBadge` for why neither may read "Verified".
 *  - Experience is a HERO STAT, not a quiet meta row — but see AC7 below.
 *  - Every optional block degrades to nothing: a sparse profile (one skill, no bio,
 *    no experience) must still look intentional, never broken.
 *
 * AC7 HONESTY NOTE: the stat shows a BUCKET, not a year count, and "seasoned" means
 * the TOP bucket. `years_experience` is a `select_one` whose ceiling is "Over 10
 * years" (`docs/questionnaire_schema.md:51,134-141`) — there is no exact number of
 * years anywhere in the data, so the mockup's "34 yrs" and its "20+ years" star
 * threshold are sample fiction. All bucket vocabulary lives in `experienceStatFor`.
 */
export function WorkerCard({ profile }: WorkerCardProps) {
  const truncatedBio = profile.bio
    ? profile.bio.length > 100 ? `${profile.bio.slice(0, 100)}...` : profile.bio
    : null;

  // Story 13-28 — surface the worker's skills (the core matchmaking signal) as
  // canonical labels; degrade gracefully when a profile has none.
  const skills = profile.skills ?? [];
  const visibleSkills = skills.slice(0, MAX_CARD_SKILLS);
  const hiddenSkillCount = skills.length - visibleSkills.length;

  const experienceStat = experienceStatFor(profile.experienceLevel);

  // Story 13-38 AC8 — a volunteered trading name leads, with the profession
  // beneath it. AC8.2: there is NO fallback to a person's name; when the field is
  // empty the card is exactly as it was, profession-led.
  //
  // [AI-Review][Low] 2026-08-18 — `title` carries the STORED name, which the write
  // path caps at MARKETPLACE_BUSINESS_NAME_MAX_LEN (80). AC8.3's "full value in
  // the tooltip" therefore means "the whole of what we hold", not "the whole of
  // what was typed" — a >80-char signboard is already truncated before it reaches
  // this component, and no card can recover what the column does not store.
  const businessName = profile.businessName?.trim() || null;

  // Story 13-58 AC4 (as corrected 2026-09-07) — the badge is keyed on the PRESENCE
  // of a stored association name and on nothing else. There is deliberately no
  // `source` check to go with it: eleven people on prod carry an AFAN vouch while
  // their own source is `public`, because the import matched them instead of
  // inserting them, and a second condition here would render them nothing while
  // looking perfectly correct. A blank name is no vouch, not an unnamed badge.
  const associationName = profile.associationName?.trim() || null;
  const professionLabel = profile.profession || 'Unknown Profession';
  const identityLine = businessName ?? professionLabel;
  const subLine = businessName ? professionLabel : null;

  return (
    <Link to={`/marketplace/profile/${profile.id}`} className="group block hover:no-underline">
      <Card
        data-testid="worker-card"
        className="flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <TradeAvatar id={profile.id} skillSlug={skills[0] ?? null} />
          <div className="min-w-0 flex-1">
            <p
              data-testid="worker-card-identity"
              className="truncate text-base font-semibold leading-tight"
              title={identityLine}
            >
              {identityLine}
            </p>
            {subLine && (
              <p
                data-testid="worker-card-profession-subline"
                className="truncate text-sm text-muted-foreground"
                title={subLine}
              >
                {subLine}
              </p>
            )}
            {profile.lgaName && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.lgaName}</span>
              </div>
            )}
          </div>
          {(profile.verifiedBadge || associationName) && (
            // `max-w-[45%]` bounds the trust slot: the identity line owns the rest
            // of the row, and a long association name ellipsizes rather than
            // squeezing the trading name it sits beside.
            <div className="flex min-w-0 max-w-[45%] flex-col items-end gap-1">
              {profile.verifiedBadge && (
                <GovernmentVerifiedBadge interactive={false} compact />
              )}
              {associationName && (
                <AssociationConfirmedBadge
                  associationName={associationName}
                  interactive={false}
                  compact
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
          {experienceStat && (
            <div
              data-testid="worker-card-experience-stat"
              className="flex items-baseline gap-1.5 rounded-lg border bg-muted/50 px-3 py-2"
            >
              <span className="text-xl font-bold leading-none tabular-nums text-primary">
                {experienceStat.value}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                {experienceStat.unit}
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                {experienceStat.seasoned && (
                  <Star
                    data-testid="worker-card-seasoned-marker"
                    className="h-3.5 w-3.5 fill-amber-500 text-amber-500"
                    aria-hidden="true"
                  />
                )}
                {experienceStat.label}
              </span>
            </div>
          )}

          {visibleSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="worker-card-skills">
              {visibleSkills.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center rounded-full bg-primary-600/10 px-2 py-0.5 text-xs font-medium text-primary-600"
                >
                  {skillLabelForSlug(slug)}
                </span>
              ))}
              {hiddenSkillCount > 0 && (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  data-testid="worker-card-skills-more"
                >
                  +{hiddenSkillCount} more
                </span>
              )}
            </div>
          )}

          {truncatedBio && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{truncatedBio}</p>
          )}

          <span
            data-testid="worker-card-cta"
            className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90"
          >
            View profile &amp; contact
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
