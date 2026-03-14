import { useState } from 'react';
import { useActivationStatus } from '../hooks/useAnalytics';

const STORAGE_KEY = 'analytics-activation-collapsed';

export function ActivationStatusPanel() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch { return true; }
  });

  const { data, isLoading, error } = useActivationStatus();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
  };

  if (isLoading) {
    return (
      <div className="mt-6 rounded-lg border bg-white p-4">
        <div className="h-4 w-48 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-lg border bg-white p-4 text-center">
        <p className="text-sm text-gray-500">Unable to load activation status</p>
      </div>
    );
  }

  if (!data) return null;

  const active = data.features.filter(f => f.category === 'active');
  const approaching = data.features.filter(f => f.category === 'approaching');
  const dormant = data.features.filter(f => f.category === 'dormant');

  return (
    <div className="mt-6 rounded-lg border bg-white">
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="activation-status-content"
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Analytics Activation Status</h3>
          <span className="text-xs text-gray-400">
            {active.length} active, {approaching.length} approaching, {dormant.length} dormant
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div id="activation-status-content" className="border-t px-4 pb-4 space-y-4">
          {active.length > 0 && (
            <FeatureGroup title="Active" features={active} badgeClass="bg-green-100 text-green-700" />
          )}
          {approaching.length > 0 && (
            <FeatureGroup title="Approaching" features={approaching} badgeClass="bg-amber-100 text-amber-700" />
          )}
          {dormant.length > 0 && (
            <FeatureGroup title="Dormant" features={dormant} badgeClass="bg-gray-100 text-gray-500" />
          )}
        </div>
      )}
    </div>
  );
}

/** Per-feature descriptions for dormant hooks with non-standard requirements */
const DORMANT_DESCRIPTIONS: Record<string, string> = {
  seasonality_detection: 'Requires 365+ days of data',
  campaign_effectiveness: 'Requires campaign event dates',
  response_entropy: 'Requires 50+ submissions per enumerator',
  gps_dispersion: 'Requires 20+ GPS-tagged submissions per enumerator',
};

function FeatureGroup({ title, features, badgeClass }: {
  title: string;
  features: { id: string; label: string; currentN: number; requiredN: number; phase: number }[];
  badgeClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mt-3 mb-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {title}
        </span>
      </div>
      <div className="space-y-2">
        {features.map(f => {
          const customDesc = DORMANT_DESCRIPTIONS[f.id];
          const progress = (f.requiredN > 0 && !customDesc)
            ? Math.min(100, Math.round((f.currentN / f.requiredN) * 100))
            : (customDesc ? 0 : 100);
          return (
            <div key={f.id} className="flex items-center gap-3">
              <span className={`text-xs text-gray-700 w-56 truncate ${f.phase >= 5 ? 'italic' : ''}`}>
                {f.label}
              </span>
              {customDesc ? (
                <span className="flex-1 text-xs text-gray-400 italic">{customDesc}</span>
              ) : (
                <>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={f.currentN} aria-valuemin={0} aria-valuemax={f.requiredN} aria-label={`${f.label} progress`}>
                    <div
                      className={`h-full rounded-full transition-all ${
                        progress >= 100 ? 'bg-green-500' : progress > 50 ? 'bg-amber-400' : 'bg-gray-300'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-20 text-right">
                    {f.currentN} / {f.requiredN}
                  </span>
                </>
              )}
            </div>
          );
        })}
        {features.some(f => f.phase >= 5 && !DORMANT_DESCRIPTIONS[f.id]) && (
          <p className="text-xs text-gray-400 italic mt-1">
            Activates automatically when submission threshold is reached
          </p>
        )}
      </div>
    </div>
  );
}
