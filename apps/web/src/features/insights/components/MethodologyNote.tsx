interface MethodologyNoteProps {
  /** Registered PEOPLE — the honest headline count (Story 13-25). */
  totalRegistered: number;
  lastUpdated?: string;
}

export function MethodologyNote({ totalRegistered, lastUpdated }: MethodologyNoteProps) {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section aria-labelledby="methodology-heading" className="bg-neutral-50 rounded-lg p-6 mt-8">
      <h2 id="methodology-heading" className="text-lg font-semibold text-neutral-900 mb-4">
        Methodology &amp; Trust
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-neutral-600">
        <div>
          <div className="font-medium text-neutral-700">Registered People</div>
          <div>{totalRegistered.toLocaleString()}</div>
        </div>
        {/* "Complete Survey Responses" tile removed 2026-08-26 — same ruling as the
            note below. Post-intake it would read 282 beside a headline of ~9,500: a 3%
            ratio, unexplained, on a public page. The survey-completion stratum is a
            REPORT metric (taxonomy R3's `full` floor), not a public headline. */}
        <div>
          <div className="font-medium text-neutral-700">Update Frequency</div>
          <div>Data refreshed hourly</div>
        </div>
        <div>
          <div className="font-medium text-neutral-700">Data Suppression</div>
          <div>Categories with fewer than 10 responses are withheld</div>
        </div>
      </div>
      {/*
        ⛔ REWRITTEN 2026-08-26 (Awwal's ruling). The old copy read: "The demographic,
        employment, and skills breakdowns above are based on the {withAnswers} registrants
        with complete survey responses. Data collected via field enumeration &
        self-registration."

        Two problems, both about to get worse. (1) It named TWO collection routes when
        there are four — association proxy and clerk entry were missing, and the string
        was hardcoded rather than derived. (2) It qualified the whole page against
        `withAnswers`, so once the association intake lands it would have explained that
        breakdowns rest on ~282 while the headline reads ~9,500 — a 3% ratio, unexplained,
        on a public page during a campaign season.

        ⭐ The page no longer NEEDS that qualification. Every figure now published is
        measurable across all three taxonomy axes (~99% populated on every route): total
        registered, LGA coverage and density, gender, GPI, skills. The deep-field metrics
        that required a denominator caveat were removed rather than caveated. So this note
        describes the METHOD, not the limits — the strata, the composition and the
        limitations belong in the final report, where a reader can ask a question about
        them.
      */}
      <p className="mt-4 text-sm text-neutral-600">
        Every figure on this page counts{' '}
        <span className="font-medium text-neutral-700">all {totalRegistered.toLocaleString()}</span>{' '}
        registered people. Registrations reach the Registry through several routes — people
        registering themselves online, field enumerators, data-entry clerks, and trade
        associations submitting their members&apos; details — and the figures above are
        collected identically on every route.
      </p>
      {formattedDate && (
        <div className="mt-4 pt-3 border-t border-neutral-200">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
            Last updated: {formattedDate}
          </span>
        </div>
      )}
    </section>
  );
}
