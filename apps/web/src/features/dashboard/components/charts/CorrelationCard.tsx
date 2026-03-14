import type { CorrelationResult } from '@oslsr/types';
import { SignificanceBadge } from './SignificanceBadge';

interface CorrelationCardProps {
  result: CorrelationResult;
}

export function CorrelationCard({ result }: CorrelationCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 capitalize">{result.hypothesis}</h4>
        <SignificanceBadge significant={result.significant} pBracket={result.pBracket} />
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>r = {result.coefficient.toFixed(2)}</span>
        <span>p {result.pBracket}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {result.method}
        </span>
      </div>

      <p className="text-sm text-gray-700">{result.interpretation}</p>
    </div>
  );
}
