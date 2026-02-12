import { X } from 'lucide-react';
import { useState } from 'react';

export function StorageWarningBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('oslrs-storage-warning-dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem('oslrs-storage-warning-dismissed', '1');
    } catch {
      // sessionStorage unavailable — dismiss for this render only
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative flex items-center gap-3 rounded-lg bg-amber-600 px-4 py-3 text-sm text-white"
    >
      <span>
        Storage not secured. Avoid clearing browser data to prevent data loss.
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss storage warning"
        className="ml-auto shrink-0 rounded p-1 text-white hover:bg-white/10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
