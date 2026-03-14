import type { GroupComparisonResult } from '@oslsr/types';
import { SignificanceBadge } from './SignificanceBadge';

interface GroupComparisonCardProps {
  result: GroupComparisonResult;
}

export function GroupComparisonCard({ result }: GroupComparisonCardProps) {
  const entries = Object.entries(result.groupMedians);
  const maxMedian = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 capitalize">{result.hypothesis}</h4>
        <SignificanceBadge significant={result.significant} pBracket={result.pBracket} />
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{result.method === 'mann-whitney' ? 'U' : 'H'} = {result.statistic}</span>
        <span>p {result.pBracket}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {result.method === 'mann-whitney' ? 'Mann-Whitney U' : 'Kruskal-Wallis H'}
        </span>
      </div>

      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.slice(0, 8).map(([group, med]) => (
            <div key={group} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-gray-500">{group}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#9C1E23]"
                  style={{ width: `${(med / maxMedian) * 100}%` }}
                />
              </div>
              <span className="w-16 text-right text-gray-600">{med.toLocaleString()}</span>
            </div>
          ))}
          {entries.length > 8 && (
            <p className="text-xs text-gray-400 italic">and {entries.length - 8} more groups</p>
          )}
        </div>
      )}

      <p className="text-sm text-gray-700">{result.interpretation}</p>
    </div>
  );
}
