import type { FraudThresholdConfig } from '@oslsr/types';

/**
 * Extract a threshold value by rule key from a config array.
 * Returns `defaultValue` when no matching rule is found.
 */
export function getThreshold(config: FraudThresholdConfig[], ruleKey: string, defaultValue: number): number {
  const found = config.find((c) => c.ruleKey === ruleKey);
  return found ? found.thresholdValue : defaultValue;
}
