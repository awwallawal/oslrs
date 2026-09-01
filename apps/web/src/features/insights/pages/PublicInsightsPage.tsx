import { Users, MapPin, Scale, Lightbulb } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { usePublicInsights } from '../hooks/usePublicInsights';
import { StatCard } from '../components/StatCard';
import { PublicDemographicsSection } from '../components/PublicDemographicsSection';
import { PublicSkillsChart } from '../components/PublicSkillsChart';
import { PublicLgaTable } from '../components/PublicLgaTable';
import { LgaChoroplethMap } from '../../dashboard/components/charts/LgaChoroplethMap';
import { lgaDistributionToMapData } from '../../dashboard/utils/analytics-transforms';
import { MethodologyNote } from '../components/MethodologyNote';
import { SkillsByLgaSection } from '../components/SkillsByLgaSection';

function HeroSkeleton() {
  return (
    <div className="bg-gradient-to-r from-[#9C1E23] to-[#7A171B] py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <Skeleton className="h-10 w-96 bg-white/20 mb-8 mx-auto" />
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 bg-white/10 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-12 space-y-12">
      {[1, 2, 3, 4].map(i => (
        <div key={i}>
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      ))}
    </div>
  );
}

export default function PublicInsightsPage() {
  useDocumentTitle('Labour Market Insights');
  const { data, isLoading, error, refetch } = usePublicInsights();

  if (isLoading) {
    return (
      <>
        <HeroSkeleton />
        <ContentSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-4">Unable to load insights</h1>
        <p className="text-neutral-600 mb-6">{(error as Error).message}</p>
        <button
          onClick={() => refetch()}
          className="px-6 py-2 bg-[#9C1E23] text-white rounded-lg hover:bg-[#7A171B] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#9C1E23] to-[#7A171B] py-16 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">
            Oyo State Labour Force at a Glance
          </h1>
          {/* 3 cards since 2026-08-26 (Youth Employment removed). A 4-col grid left-aligned
              them and left a visible hole on the right — centre a 3-col row instead. */}
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {/*
              Story 13-46 (AC5) — REGISTERED vs the TRUST TIERS, so the headline survives inflation.
              Until now this was a single unqualified count with no verification filter anywhere
              behind it, on an UNAUTHENTICATED endpoint, fed by a public write path: one bot row was
              a government-facing number within one cache TTL. A registration burst now moves
              "Total Registered" and leaves "NIN on file" untouched — which is the truth, and is
              honest-display RULE 5 (verified and pending are never blended in a registry-size
              claim).

              ⚠️ THE LABEL IS "NIN on file", NEVER "Verified" (12-4 AC9 / ruling R1). A NIN is
              CAPTURED, never validated — there is no NIMC check available and NINs carry no check
              digit, so calling it "verified" would be a claim the system cannot support. The
              taxonomy has no `verified` tier for exactly this reason; do not add one to the copy.

              Read defensively (`?.` + `?? 0`): a payload cached before this deploy has no
              `byVerification` at all, and an `undefined.nin_on_file` on the public page is the
              failure the CACHE_KEY bump exists to avoid — belt as well as braces.

              ⚠️ ALL FOUR TIERS ARE RENDERED (review A10 / finding M3). The first cut showed only
              `nin_on_file` while the shared type made all four REQUIRED — i.e. three computed,
              required, shipped fields that no component read. That is three-quarters of the exact
              12-5 defect this story's notes claimed to have avoided, and because no test asserted
              the subtitle, deleting the one rendered tier would have left the web suite green.
            */}
            {/*
              ⛔ 2026-08-26 — the `byVerification` subtitle was REMOVED (Awwal's ruling).
              It read "N with NIN on file · N self-declared · N awaiting NIN · N imported,
              unverified". 13-46 AC5 added it so the headline "stops being a single
              unqualified count", and honest-display RULE 5 backed that. Sound reasoning,
              wrong surface: once the association intake lands it would print
              "9,505 imported, unverified" under the headline — the word *unverified*
              against ~96% of the registry, in the most screenshot-able place on the site,
              during a campaign season. A caveat the reader cannot interrogate is not a
              caveat; it is a headline somebody else gets to write.
              The composition is NOT hidden — 12-6 renders all three axes on the internal
              data-health view, and the strata belong in the final report with the method
              beside them.
            */}
            <StatCard
              icon={Users}
              label="Total Registered"
              value={data.totalRegistered}
            />
            <StatCard
              icon={MapPin}
              label="LGAs Covered"
              value={data.lgasCovered}
            />
            {/*
              Story 12-5 / ruling R-E: every published rate ships with the n it
              was computed from. These denominators are NOT the same number —
              each rate divides by the people who answered ITS OWN question — so
              a rate over 40 people can no longer be read with the authority of
              one over 300. `rateDenominators` has been on the payload since
              12-4 and, until now, no component read it.

              Read defensively (`?.` + `basedOnCaptionIfKnown`): the service
              defaults every entry to `Number(… ?? 0)`, so an absent denominator
              arrives as 0, not as null. "based on 0 responses" printed under a
              real percentage would be worse than printing nothing — and this is
              the page the campaign points at.
            */}
            <StatCard
              icon={Scale}
              label="Gender Parity Index"
              value={data.gpi != null ? Math.round(data.gpi * 100) : null}
              suffix="%"
              /* No "based on n" caption: GPI derives from gender alone, which is
                 ~99% populated on every intake route, so its n IS the headline total. */
              subtitle={data.gpi != null ? `GPI: ${data.gpi.toFixed(2)}` : undefined}
            />
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* Age removed 2026-08-26: ~35% populated across the intake routes (only
            L-PRES carries DOB), so it could not be published without a caveat. */}
        <PublicDemographicsSection genderSplit={data.genderSplit} />

        {/* PublicEmploymentSection removed 2026-08-26 — employment (~2%),
            formal/informal (~2%) and the unemployment estimate (~2%) are collected by
            no intake route but the enumerator instrument. The unemployment figure had
            already published WRONG once (12-6 ruling R-E: "not asked" silently became
            "not employed", 18.4% vs 23.9%). Deep-field analysis is the `full` stratum's
            job (taxonomy R3) and belongs in the final report. */}
        <PublicSkillsChart allSkills={data.allSkills} />

        {/* Story 8.8 AC#3: Geographic choropleth for public insights.
            Story 13-33 AC3: banded disclosure is pre-computed by the backend
            (`bandSmallBuckets`, the single authority) and carried on each datum's
            `banded` flag — so the map no longer re-suppresses via `suppressionMinN`.
            LGAs with ≥10 render graduated with counts; 1–9 render a lightest
            "present" shade with no exact number; 0 are blank. */}
        <section data-testid="geographic-map-section">
          <h2 className="text-2xl font-bold text-neutral-900 mb-6">Registration Density Map</h2>
          <LgaChoroplethMap data={lgaDistributionToMapData(data.lgaDensity)} />
          <p className="mt-2 text-xs text-neutral-500">
            Shaded areas show registration density. The lightest shade marks local
            governments with registrations present but fewer than 10; exact counts
            are shown only where at least 10 people are registered, to protect privacy.
          </p>
        </section>

        {/* Skills x LGA — the Registry's purpose as a chart. Both axes universal. */}
        <SkillsByLgaSection skillsByLga={data.skillsByLga} />

        <PublicLgaTable lgaDensity={data.lgaDensity} />

        {/*
          ⛔ RegistrationGrowthChart REMOVED 2026-08-31, before it ever met real volume.
          Added hours earlier because `created_at` is universal and needs no caveat — which
          is still true, and is not the point. The association intake lands ~8,000 people in
          one confirm, so the cumulative line would show a VERTICAL CLIFF. A reader does not
          see "a registry that grew"; they see a dump. The rows are legitimate and the number
          is honest, but a chart that invites the wrong reading on a public page during a
          campaign season is a liability the page does not need. Growth belongs in Campaign
          Watch, behind auth, where the shape can be explained.
        */}

        <MethodologyNote
          totalRegistered={data.totalRegistered}
          lastUpdated={data.lastUpdated}
        />

        {/* Story 8.7: Key Findings — only shown when available */}
        {data.keyFindings && data.keyFindings.length > 0 && (
          <section data-testid="key-findings-section">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Key Findings</h2>
            <div className="space-y-3">
              {data.keyFindings.map((finding, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border bg-neutral-50 p-4"
                >
                  <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-neutral-700">{finding}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
