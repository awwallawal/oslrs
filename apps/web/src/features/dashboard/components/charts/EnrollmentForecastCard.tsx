import type { EnrollmentForecast } from '@oslsr/types';

interface EnrollmentForecastCardProps {
  forecast: EnrollmentForecast;
}

export function EnrollmentForecastCard({ forecast }: EnrollmentForecastCardProps) {
  const progress = forecast.nextThresholdN > 0
    ? Math.min(100, Math.round((forecast.currentN / forecast.nextThresholdN) * 100))
    : 100;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-900">Enrollment Velocity Forecast</h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Daily Rate</p>
          <p className="text-xl font-bold text-gray-900">
            {forecast.dailyRate > 0 ? `~${forecast.dailyRate}/day` : 'Flat'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Projected Date</p>
          <p className="text-xl font-bold text-gray-900">
            {forecast.projectedDate || '—'}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{forecast.currentN.toLocaleString()} / {forecast.nextThresholdN.toLocaleString()}</span>
          <span>{forecast.nextThresholdLabel}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={forecast.currentN} aria-valuemin={0} aria-valuemax={forecast.nextThresholdN} aria-label="Enrollment progress">
          <div
            className="h-full rounded-full bg-[#9C1E23] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-gray-700">{forecast.interpretation}</p>
    </div>
  );
}
