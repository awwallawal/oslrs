/**
 * ThresholdEditRow Component
 *
 * Displays a single threshold with label, description, current value,
 * and inline edit mode with save/cancel.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { useState, useEffect } from 'react';
import type { FraudThresholdConfig } from '@oslsr/types';

interface ThresholdEditRowProps {
  threshold: FraudThresholdConfig;
  onSave: (ruleKey: string, newValue: number) => void;
  isSaving: boolean;
}

export function ThresholdEditRow({ threshold, onSave, isSaving }: ThresholdEditRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(threshold.thresholdValue));

  // Sync editValue when threshold prop changes (e.g., after save)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(threshold.thresholdValue));
    }
  }, [threshold.thresholdValue, isEditing]);

  const handleSave = () => {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) return;
    onSave(threshold.ruleKey, parsed);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(String(threshold.thresholdValue));
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0" data-testid={`threshold-row-${threshold.ruleKey}`}>
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-gray-900">{threshold.displayName}</p>
        <p className="text-xs text-gray-500 mt-0.5">{threshold.ruleKey}</p>
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <input
              type="number"
              step="any"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#9C1E23] focus:border-transparent"
              data-testid={`threshold-input-${threshold.ruleKey}`}
              disabled={isSaving}
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={isSaving || isNaN(parseFloat(editValue))}
              className="px-2 py-1 text-xs font-medium text-white bg-[#9C1E23] rounded hover:bg-[#7A171B] disabled:opacity-50"
              data-testid={`threshold-save-${threshold.ruleKey}`}
            >
              {isSaving ? '...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              data-testid={`threshold-cancel-${threshold.ruleKey}`}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-mono text-gray-700 min-w-[60px] text-right" data-testid={`threshold-value-${threshold.ruleKey}`}>
              {threshold.thresholdValue}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-xs font-medium text-[#9C1E23] bg-red-50 rounded hover:bg-red-100"
              data-testid={`threshold-edit-${threshold.ruleKey}`}
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
