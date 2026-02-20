/**
 * Fraud Thresholds API client
 *
 * Super Admin API for managing fraud detection threshold configuration.
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 */

import { apiClient } from '../../../lib/api-client';
import type { FraudThresholdConfig, HeuristicCategory } from '@oslsr/types';

export type ThresholdsByCategory = Record<string, FraudThresholdConfig[]>;

/**
 * GET /api/v1/fraud-thresholds — list active thresholds grouped by category.
 */
export async function getFraudThresholds(): Promise<ThresholdsByCategory> {
  const result = await apiClient('/fraud-thresholds');
  return result.data;
}

/**
 * PUT /api/v1/fraud-thresholds/:ruleKey — create new threshold version.
 */
export async function updateFraudThreshold(
  ruleKey: string,
  data: {
    thresholdValue: number;
    weight?: number;
    severityFloor?: string;
    isActive?: boolean;
    notes?: string;
  },
): Promise<FraudThresholdConfig> {
  const result = await apiClient(`/fraud-thresholds/${ruleKey}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return result.data;
}
