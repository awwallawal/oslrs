import { useState, useRef, useCallback, useEffect } from 'react';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { checkNinAvailability } from '../api/nin-check.api';

interface NinCheckState {
  isChecking: boolean;
  isDuplicate: boolean;
  duplicateInfo: { reason: string; registeredAt?: string } | null;
}

const DEBOUNCE_MS = 500;

export function useNinCheck() {
  const [state, setState] = useState<NinCheckState>({
    isChecking: false,
    isDuplicate: false,
    duplicateInfo: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkNin = useCallback((nin: string) => {
    // Clear any pending debounced call
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Skip if offline
    if (!navigator.onLine) return;

    // Client-side format validation before API call
    if (!/^\d{11}$/.test(nin)) return;
    if (!modulus11Check(nin)) return;

    setState(prev => ({ ...prev, isChecking: true }));

    timerRef.current = setTimeout(async () => {
      try {
        const result = await checkNinAvailability(nin);
        setState({
          isChecking: false,
          isDuplicate: !result.available,
          duplicateInfo: result.available
            ? null
            : { reason: result.reason!, registeredAt: result.registeredAt },
        });
      } catch {
        // API error — don't block form (ingestion worker is the safety net)
        setState({ isChecking: false, isDuplicate: false, duplicateInfo: null });
      }
    }, DEBOUNCE_MS);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState({ isChecking: false, isDuplicate: false, duplicateInfo: null });
  }, []);

  // Cleanup: clear pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { ...state, checkNin, reset };
}
