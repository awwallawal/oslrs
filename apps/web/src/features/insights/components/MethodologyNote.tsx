interface MethodologyNoteProps {
  /** Registered PEOPLE — the honest headline count (Story 13-25). */
  totalRegistered: number;
  /**
   * Registered people with complete survey responses — the completed-survey
   * subset the breakdowns describe (Story 13-25). Optional/defaulted because a
   * stale pre-13-25 cache blob (Redis, 1h TTL) can serve a payload without it;
   * we render 0 rather than crash on `undefined.toLocaleString()`.
   */
  withAnswers?: number;
  lastUpdated?: string;
}

export function MethodologyNote({ totalRegistered, withAnswers = 0, lastUpdated }: MethodologyNoteProps) {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Registered people whose survey answers are not on file (soft-launch salvage
  // + no-submission + pending-NIN). Counted in the register, excluded from the
  // breakdowns below — surfaced transparently as data completeness, not error.
  const withoutAnswers = Math.max(0, totalRegistered - withAnswers);

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
        <div>
          <div className="font-medium text-neutral-700">Complete Survey Responses</div>
          <div>{withAnswers.toLocaleString()}</div>
        </div>
        <div>
          <div className="font-medium text-neutral-700">Update Frequency</div>
          <div>Data refreshed hourly</div>
        </div>
        <div>
          <div className="font-medium text-neutral-700">Data Suppression</div>
          <div>Categories with fewer than 10 responses are withheld</div>
        </div>
      </div>
      <p className="mt-4 text-sm text-neutral-600">
        The demographic, employment, and skills breakdowns above are based on the{' '}
        <span className="font-medium text-neutral-700">{withAnswers.toLocaleString()}</span> registrants with
        complete survey responses.
        {withoutAnswers > 0 && (
          <>
            {' '}The remaining{' '}
            <span className="font-medium text-neutral-700">{withoutAnswers.toLocaleString()}</span> registered people
            (identity captured during the soft-launch; survey answers not on file) are counted in the total but not in the
            breakdowns.
          </>
        )}{' '}
        Data collected via field enumeration &amp; self-registration.
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
