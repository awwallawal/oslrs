/**
 * QuickFilterPresets — Preset filter buttons for registry table
 *
 * Story 5.5 Task 7: 5 preset buttons (All Records, Live Feed, This Week, Flagged, Pending Review).
 * Active preset is visually highlighted. WAT timezone (UTC+1) for date calculations.
 */

import type { RespondentFilterParams } from '@oslsr/types';

interface PresetConfig {
  key: string;
  label: string;
  /** Static filters or a factory that computes filters at click time (for dynamic dates) */
  getFilters: () => Partial<RespondentFilterParams>;
  sort: { sortBy: string; sortOrder: 'asc' | 'desc' };
}

/** Start of today in WAT (UTC+1), returned as UTC ISO string */
export function todayStartWAT(): string {
  const now = new Date();
  const watNow = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  watNow.setUTCHours(0, 0, 0, 0);
  return new Date(watNow.getTime() - 1 * 60 * 60 * 1000).toISOString();
}

/** Start of current week (Monday) in WAT, returned as UTC ISO string */
export function weekStartWAT(): string {
  const watNow = new Date(Date.now() + 1 * 60 * 60 * 1000);
  const day = watNow.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  watNow.setUTCDate(watNow.getUTCDate() - diff);
  watNow.setUTCHours(0, 0, 0, 0);
  return new Date(watNow.getTime() - 1 * 60 * 60 * 1000).toISOString();
}

export const PRESETS: PresetConfig[] = [
  {
    key: 'all',
    label: 'All Records',
    getFilters: () => ({}),
    sort: { sortBy: 'registeredAt', sortOrder: 'desc' },
  },
  {
    key: 'live',
    label: 'Live Feed',
    getFilters: () => ({ dateFrom: todayStartWAT() }),
    sort: { sortBy: 'registeredAt', sortOrder: 'desc' },
  },
  {
    key: 'week',
    label: 'This Week',
    getFilters: () => ({ dateFrom: weekStartWAT() }),
    sort: { sortBy: 'registeredAt', sortOrder: 'desc' },
  },
  {
    key: 'flagged',
    label: 'Flagged',
    getFilters: () => ({ severity: 'medium,high,critical' }),
    sort: { sortBy: 'fraudScore', sortOrder: 'desc' },
  },
  {
    key: 'pending',
    label: 'Pending Review',
    getFilters: () => ({ verificationStatus: 'pending' }),
    sort: { sortBy: 'registeredAt', sortOrder: 'asc' },
  },
];

interface QuickFilterPresetsProps {
  activePreset: string | null;
  onPresetChange: (preset: PresetConfig) => void;
  isOfficialRoute?: boolean;
}

export function QuickFilterPresets({
  activePreset,
  onPresetChange,
  isOfficialRoute = false,
}: QuickFilterPresetsProps) {
  const activeClass = isOfficialRoute
    ? 'bg-[#9C1E23] text-white'
    : 'bg-neutral-900 text-white';
  const inactiveClass = 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50';

  return (
    <div className="flex flex-wrap gap-2" data-testid="quick-filter-presets">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => onPresetChange(preset)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activePreset === preset.key ? activeClass : inactiveClass
          }`}
          data-testid={`preset-${preset.key}`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
