import { useState } from 'react';
import type { FrequencyBucket } from '@oslsr/types';

interface PublicLgaTableProps {
  lgaDensity: FrequencyBucket[];
}

export function PublicLgaTable({ lgaDensity }: PublicLgaTableProps) {
  const [showAll, setShowAll] = useState(false);

  const visible = lgaDensity.filter(b => !b.suppressed);
  const displayed = showAll ? visible : visible.slice(0, 10);

  return (
    <section aria-labelledby="geographic-heading">
      <h2 id="geographic-heading" className="text-2xl font-bold text-neutral-900 mb-6">Geographic Distribution</h2>
      {displayed.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="py-3 px-4 text-sm font-semibold text-neutral-600">LGA</th>
                <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-right">Registrations</th>
                <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((lga) => (
                <tr key={lga.label} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-3 px-4 text-sm text-neutral-900">{lga.label}</td>
                  <td className="py-3 px-4 text-sm text-neutral-700 text-right">
                    {(lga.count ?? 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-500 text-right">
                    {lga.percentage != null ? `${lga.percentage.toFixed(1)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-3 text-sm text-primary-600 hover:underline"
            >
              {showAll ? 'Show less' : `Show all ${visible.length} LGAs`}
            </button>
          )}
        </div>
      ) : (
        <p className="text-neutral-500">No geographic data available</p>
      )}
    </section>
  );
}
