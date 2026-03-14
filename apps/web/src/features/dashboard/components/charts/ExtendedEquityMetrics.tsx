import type { ExtendedEquityData } from '@oslsr/types';
import { ThresholdGuard } from '../ThresholdGuard';

interface ExtendedEquityMetricsProps {
  data?: ExtendedEquityData;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
}

export function ExtendedEquityMetrics({ data, isLoading, error, onRetry }: ExtendedEquityMetricsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">Failed to load extended equity metrics</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 text-xs text-red-700 underline">Retry</button>
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Extended Equity Metrics</h3>
      <p className="text-xs text-gray-500 -mt-2">
        Proxy based on education level vs employment formality tier
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Disability Employment Gap */}
        <ThresholdGuard threshold={data.thresholds.disabilityGap} label="Disability Gap">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Disability Employment Gap</p>
            {data.disabilityGap ? (
              <>
                <p className="text-2xl font-bold text-gray-900">
                  {(data.disabilityGap.gap * 100).toFixed(1)}%
                </p>
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  <p>Disabled: {(data.disabilityGap.disabledEmployedRate * 100).toFixed(1)}% employed</p>
                  <p>Non-disabled: {(data.disabilityGap.nonDisabledEmployedRate * 100).toFixed(1)}% employed</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Insufficient data</p>
            )}
          </div>
        </ThresholdGuard>

        {/* Education-Employment Alignment */}
        <ThresholdGuard threshold={data.thresholds.educationAlignment} label="Education Alignment">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Education-Employment Alignment</p>
            {data.educationAlignment ? (
              <>
                <p className="text-2xl font-bold text-gray-900">
                  {data.educationAlignment.alignedPct.toFixed(1)}% aligned
                </p>
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  <p>Over-qualified: {data.educationAlignment.overQualifiedPct.toFixed(1)}%</p>
                  <p>Under-qualified: {data.educationAlignment.underQualifiedPct.toFixed(1)}%</p>
                  <p className="text-gray-400">n = {data.educationAlignment.n}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Insufficient data</p>
            )}
          </div>
        </ThresholdGuard>

        {/* Geographic Equity (Gini) */}
        <ThresholdGuard threshold={data.thresholds.giniCoefficient} label="Geographic Equity">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-gray-500">Geographic Equity (Gini)</p>
            {data.giniCoefficient ? (
              <>
                <p className="text-2xl font-bold text-gray-900">
                  {data.giniCoefficient.value.toFixed(3)}
                </p>
                <p className="text-xs text-gray-600 mt-1 capitalize">
                  {data.giniCoefficient.interpretation}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Across {data.giniCoefficient.lgaCount} LGAs
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Insufficient data</p>
            )}
          </div>
        </ThresholdGuard>
      </div>
    </div>
  );
}
