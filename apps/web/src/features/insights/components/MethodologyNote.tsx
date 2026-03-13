interface MethodologyNoteProps {
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
          <div className="font-medium text-neutral-700">Sample Size</div>
          <div>N = {totalRegistered.toLocaleString()}</div>
        </div>
        <div>
          <div className="font-medium text-neutral-700">Collection Method</div>
          <div>Field enumeration &amp; self-registration</div>
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
