import type { ChiSquareResult } from '@oslsr/types';
import { SignificanceBadge } from './SignificanceBadge';

const EFFECT_COLORS: Record<string, string> = {
  negligible: 'bg-gray-100 text-gray-600',
  small: 'bg-blue-100 text-blue-700',
  medium: 'bg-amber-100 text-amber-700',
  large: 'bg-red-100 text-red-700',
};

interface ChiSquareCardProps {
  result: ChiSquareResult;
}

export function ChiSquareCard({ result }: ChiSquareCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 capitalize">{result.hypothesis}</h4>
        <SignificanceBadge significant={result.significant} pBracket={result.pBracket} />
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>χ² = {result.chiSq}</span>
        <span>df = {result.df}</span>
        <span>p {result.pBracket}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EFFECT_COLORS[result.effectLabel] || EFFECT_COLORS.negligible}`}
        >
          V = {result.cramersV} ({result.effectLabel})
        </span>
      </div>

      <p className="text-sm text-gray-700">{result.interpretation}</p>
    </div>
  );
}
