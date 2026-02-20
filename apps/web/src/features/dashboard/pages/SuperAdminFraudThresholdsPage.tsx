/**
 * Super Admin Fraud Thresholds Page
 *
 * Displays all configurable fraud detection thresholds grouped by category.
 * Each threshold can be edited inline with save confirmation.
 *
 * Route: /dashboard/super-admin/settings/fraud-thresholds
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { useFraudThresholds, useUpdateFraudThreshold } from '../hooks/useFraudThresholds';
import { ThresholdCategoryCard } from '../components/ThresholdCategoryCard';
import { SkeletonCard } from '../../../components/skeletons';

// Category display order
const CATEGORY_ORDER = ['gps', 'speed', 'straightline', 'duplicate', 'timing', 'composite'];

export default function SuperAdminFraudThresholdsPage() {
  const { data: thresholdsByCategory, isLoading, error } = useFraudThresholds();
  const updateMutation = useUpdateFraudThreshold();

  const handleSave = (ruleKey: string, newValue: number) => {
    updateMutation.mutate({ ruleKey, data: { thresholdValue: newValue } });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6" data-testid="thresholds-loading">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center" data-testid="thresholds-error">
        <p className="text-red-600">Failed to load fraud thresholds</p>
        <p className="text-sm text-gray-500 mt-1">{error.message}</p>
      </div>
    );
  }

  if (!thresholdsByCategory || Object.keys(thresholdsByCategory).length === 0) {
    return (
      <div className="p-6 text-center" data-testid="thresholds-empty">
        <p className="text-gray-600">No fraud thresholds configured</p>
      </div>
    );
  }

  // Sort categories by defined order, unknown categories go to end
  const sortedCategories = Object.keys(thresholdsByCategory).sort(
    (a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    },
  );

  return (
    <div className="space-y-6 p-6" data-testid="fraud-thresholds-page">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Fraud Detection Thresholds</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure fraud detection parameters. Changes take effect immediately for new evaluations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sortedCategories.map((category) => (
          <ThresholdCategoryCard
            key={category}
            category={category}
            thresholds={thresholdsByCategory[category]}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
