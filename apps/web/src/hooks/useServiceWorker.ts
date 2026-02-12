import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(
    null
  );

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    updateFnRef.current = updateSW;
  }, []);

  const updateServiceWorker = useCallback(() => {
    updateFnRef.current?.(true);
  }, []);

  return { needRefresh, offlineReady, updateServiceWorker };
}
