import { X } from 'lucide-react';
import { useState } from 'react';

interface SWUpdateBannerProps {
  onRefresh: () => void;
}

export function SWUpdateBanner({ onRefresh }: SWUpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-center gap-4 bg-[#9C1E23] px-4 text-sm text-white"
    >
      <span>A new version is available</span>
      <button
        onClick={onRefresh}
        className="rounded border border-white px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
      >
        Refresh
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notification"
        className="absolute right-3 p-1 text-white hover:bg-white/10 rounded"
      >
        <X size={16} />
      </button>
    </div>
  );
}
