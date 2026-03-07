import { useState, useEffect } from 'react';

let cachedFingerprint: string | null = null;

export function useDeviceFingerprint(): string | null {
  const [fingerprint, setFingerprint] = useState<string | null>(cachedFingerprint);

  useEffect(() => {
    if (cachedFingerprint) return;

    async function load() {
      try {
        const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        cachedFingerprint = result.visitorId;
        setFingerprint(result.visitorId);
      } catch {
        // Fingerprinting is best-effort — don't block the reveal flow
        setFingerprint(null);
      }
    }
    load();
  }, []);

  return fingerprint;
}
