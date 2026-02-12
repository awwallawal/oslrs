import { useEffect, useState } from 'react';

interface PersistentStorageState {
  isPersisted: boolean | null;
  storageQuota: { usage: number; quota: number } | null;
  isSupported: boolean;
  showWarning: boolean;
}

export function usePersistentStorage(): PersistentStorageState {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [storageQuota, setStorageQuota] = useState<{
    usage: number;
    quota: number;
  } | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    !!navigator.storage.persist;

  useEffect(() => {
    if (!isSupported) return;

    async function requestStorage() {
      try {
        const persisted = await navigator.storage.persist();
        setIsPersisted(persisted);

        const estimate = await navigator.storage.estimate();
        setStorageQuota({
          usage: estimate.usage ?? 0,
          quota: estimate.quota ?? 0,
        });
      } catch {
        setIsPersisted(false);
      }
    }

    requestStorage();
  }, [isSupported]);

  return {
    isPersisted,
    storageQuota,
    isSupported,
    showWarning: isSupported && isPersisted === false,
  };
}
