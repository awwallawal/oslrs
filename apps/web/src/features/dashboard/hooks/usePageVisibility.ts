/**
 * usePageVisibility — Page Visibility API hook
 *
 * Story 5.5 Task 8: Pauses auto-refresh when browser tab is hidden.
 */

import { useState, useEffect } from 'react';

export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}
