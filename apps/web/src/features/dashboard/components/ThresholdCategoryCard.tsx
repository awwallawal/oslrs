/**
 * ThresholdCategoryCard Component
 *
 * Displays thresholds for a single category in a card layout.
 * Each threshold can be edited inline.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import type { FraudThresholdConfig } from '@oslsr/types';
import { ThresholdEditRow } from './ThresholdEditRow';

const CATEGORY_LABELS: Record<string, string> = {
  gps: 'GPS Clustering',
  speed: 'Speed Run',
  straightline: 'Straight-lining',
  duplicate: 'Duplicate Response',
  timing: 'Off-Hours Timing',
  composite: 'Severity Thresholds',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  gps: 'DBSCAN clustering with Haversine distance, teleportation detection',
  speed: 'Median-ratio scoring with bootstrap fallback',
  straightline: 'PIR, LIS, and Shannon entropy for scale-question batteries',
  duplicate: 'Exact and partial field match detection',
  timing: 'Night hours and weekend submission flags',
  composite: 'Score-to-severity mapping cutoffs',
};

interface ThresholdCategoryCardProps {
  category: string;
  thresholds: FraudThresholdConfig[];
  onSave: (ruleKey: string, newValue: number) => void;
  isSaving: boolean;
}

export function ThresholdCategoryCard({
  category,
  thresholds,
  onSave,
  isSaving,
}: ThresholdCategoryCardProps) {
  const label = CATEGORY_LABELS[category] ?? category;
  const description = CATEGORY_DESCRIPTIONS[category] ?? '';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5" data-testid={`category-card-${category}`}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">{label}</h3>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {thresholds.map((threshold) => (
          <ThresholdEditRow
            key={threshold.ruleKey}
            threshold={threshold}
            onSave={onSave}
            isSaving={isSaving}
          />
        ))}
      </div>
    </div>
  );
}
