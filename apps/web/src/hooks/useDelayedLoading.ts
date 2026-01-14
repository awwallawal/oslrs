import { useState, useEffect, useRef } from 'react';

/**
 * Minimum display time for loading states in milliseconds.
 * Prevents flash of loading UI for fast operations.
 * Per AC1: "skeleton should be visible for at least 200ms to prevent flash"
 */
const MIN_LOADING_DISPLAY_MS = 200;

/**
 * useDelayedLoading - Hook to enforce minimum loading display time.
 *
 * Prevents skeleton/loading states from flashing briefly when data loads quickly.
 * Once loading starts, ensures the loading state is shown for at least 200ms.
 *
 * @param isLoading - The actual loading state from data fetching
 * @returns boolean - Delayed loading state that stays true for minimum 200ms
 *
 * @example
 * const { data, isLoading: rawLoading } = useQuery({ queryKey: ['items'], queryFn: fetchItems });
 * const isLoading = useDelayedLoading(rawLoading);
 *
 * if (isLoading) {
 *   return <SkeletonCard />;  // Won't flash even if data loads in 50ms
 * }
 */
function useDelayedLoading(isLoading: boolean): boolean {
  const [delayedLoading, setDelayedLoading] = useState(isLoading);
  const loadingStartTime = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Loading started - record the start time
      loadingStartTime.current = Date.now();
      setDelayedLoading(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // Loading finished - check if minimum time has elapsed
      if (loadingStartTime.current !== null) {
        const elapsedTime = Date.now() - loadingStartTime.current;
        const remainingTime = MIN_LOADING_DISPLAY_MS - elapsedTime;

        if (remainingTime > 0) {
          // Need to wait before hiding loading state
          timeoutRef.current = setTimeout(() => {
            setDelayedLoading(false);
            loadingStartTime.current = null;
          }, remainingTime);
        } else {
          // Minimum time already elapsed
          setDelayedLoading(false);
          loadingStartTime.current = null;
        }
      } else {
        // No loading was tracked
        setDelayedLoading(false);
      }
    }

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading]);

  return delayedLoading;
}

export { useDelayedLoading, MIN_LOADING_DISPLAY_MS };
