import { useEffect, useState, useRef, useCallback } from 'react';

const DEBOUNCE_MS = 100;

export function useOnlineStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStatusChange = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsOnline(navigator.onLine);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [handleStatusChange]);

  return { isOnline };
}
