/**
 * useLiveMonitoring — Auto-refresh logic for Live Feed preset
 *
 * Story 5.5 Task 8: Combines page visibility + preset detection + 60s auto-refresh.
 * Auto-refresh only active when Live Feed preset selected AND tab visible.
 */

import { useState } from 'react';
import { usePageVisibility } from './usePageVisibility';

export function useLiveMonitoring(activePreset: string | null) {
  const isVisible = usePageVisibility();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [newCount, setNewCount] = useState(0);

  const isLiveMode = activePreset === 'live';
  const refetchInterval = isLiveMode && isVisible ? 60_000 : false;

  return {
    refetchInterval,
    lastUpdated,
    newCount,
    isLiveMode,
    setLastUpdated,
    setNewCount,
  };
}
