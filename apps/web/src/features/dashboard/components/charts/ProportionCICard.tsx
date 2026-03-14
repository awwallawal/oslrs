import type { ProportionCI } from '@oslsr/types';

interface ProportionCICardProps {
  result: ProportionCI;
}

export function ProportionCICard({ result }: ProportionCICardProps) {
  const estPct = (result.estimate * 100).toFixed(1);
  const lowerPct = (result.ci95Lower * 100).toFixed(1);
  const upperPct = (result.ci95Upper * 100).toFixed(1);

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900">{result.metric}</h4>
        <span className="text-xs text-gray-500">n = {result.n}</span>
      </div>

      <div className="text-2xl font-bold text-gray-900">{estPct}%</div>

      {/* CI range bar */}
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-[#9C1E23] opacity-20 rounded-full"
          style={{
            left: `${Number(lowerPct)}%`,
            width: `${Number(upperPct) - Number(lowerPct)}%`,
          }}
        />
        <div
          className="absolute h-full w-0.5 bg-[#9C1E23]"
          style={{ left: `${Number(estPct)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{lowerPct}%</span>
        <span className="font-medium text-gray-700">95% CI</span>
        <span>{upperPct}%</span>
      </div>

      <p className="text-sm text-gray-700">{result.interpretation}</p>
    </div>
  );
}
