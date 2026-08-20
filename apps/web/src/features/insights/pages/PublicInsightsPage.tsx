import { Users, MapPin, Scale, Briefcase, Lightbulb } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { usePublicInsights } from '../hooks/usePublicInsights';
import { StatCard } from '../components/StatCard';
import { PublicDemographicsSection } from '../components/PublicDemographicsSection';
import { PublicEmploymentSection } from '../components/PublicEmploymentSection';
import { PublicSkillsChart } from '../components/PublicSkillsChart';
import { PublicLgaTable } from '../components/PublicLgaTable';
import { LgaChoroplethMap } from '../../dashboard/components/charts/LgaChoroplethMap';
import { lgaDistributionToMapData } from '../../dashboard/utils/analytics-transforms';
import { MethodologyNote } from '../components/MethodologyNote';
import { basedOnCaptionIfKnown } from '../../dashboard/utils/registry-copy';

function HeroSkeleton() {
  return (
    <div className="bg-gradient-to-r from-[#9C1E23] to-[#7A171B] py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <Skeleton className="h-10 w-96 bg-white/20 mb-8 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Total Registered"
              value={data.totalRegistered}
              subtitle={`${(data.withAnswers ?? 0).toLocaleString()} with complete survey responses`}
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
              subtitle={data.gpi != null
                ? [`GPI: ${data.gpi.toFixed(2)}`, basedOnCaptionIfKnown(data.rateDenominators?.gpi)]
                    .filter(Boolean).join(' · ')
                : undefined}
            />
            <StatCard
              icon={Briefcase}
              label="Youth Employment Rate"
              value={data.youthEmploymentRate != null ? Math.round(data.youthEmploymentRate) : null}
              suffix="%"
              subtitle={data.youthEmploymentRate != null
                ? basedOnCaptionIfKnown(data.rateDenominators?.youthEmployment) ?? undefined
                : undefined}
            />
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        <PublicDemographicsSection
          genderSplit={data.genderSplit}
          ageDistribution={data.ageDistribution}
        />

        <PublicEmploymentSection
          employmentBreakdown={data.employmentBreakdown}
          formalInformalRatio={data.formalInformalRatio}
          unemploymentEstimate={data.unemploymentEstimate}
          unemploymentN={data.rateDenominators?.unemployment}
        />

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

        <PublicLgaTable lgaDensity={data.lgaDensity} />

        <MethodologyNote
          totalRegistered={data.totalRegistered}
          withAnswers={data.withAnswers ?? 0}
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
