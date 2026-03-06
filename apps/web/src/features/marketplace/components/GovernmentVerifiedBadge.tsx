import { useState } from 'react';
import { BadgeCheck, Info } from 'lucide-react';

interface GovernmentVerifiedBadgeProps {
  showInfo?: boolean;
  /** When false, renders a static span (safe inside links/cards). Default: true */
  interactive?: boolean;
}

export function GovernmentVerifiedBadge({ showInfo = false, interactive = true }: GovernmentVerifiedBadgeProps) {
  const [infoExpanded, setInfoExpanded] = useState(showInfo);

  if (!interactive) {
    return (
      <span
        data-testid="government-verified-badge"
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700 border border-green-200"
      >
        <BadgeCheck className="w-4 h-4" />
        Government Verified
      </span>
    );
  }

  return (
    <div data-testid="government-verified-badge">
      <button
        type="button"
        onClick={() => setInfoExpanded(!infoExpanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700 border border-green-200 cursor-pointer hover:bg-green-200 transition-colors"
        aria-expanded={infoExpanded}
        aria-label="Government Verified - click for details"
      >
        <BadgeCheck className="w-4 h-4" />
        Government Verified
        <Info className="w-3 h-3 ml-0.5 opacity-60" />
      </button>

      {infoExpanded && (
        <div
          data-testid="verification-info"
          className="mt-2 p-3 text-xs rounded-lg bg-green-50 border border-green-100 text-green-800 space-y-1.5"
        >
          <p className="font-medium">This badge means:</p>
          <ul className="list-disc list-inside space-y-0.5 text-green-700">
            <li>NIN validated and identity confirmed</li>
            <li>Skills registration reviewed</li>
            <li>Real person in Oyo State</li>
          </ul>
          <p className="font-medium mt-2">What it does NOT mean:</p>
          <ul className="list-disc list-inside space-y-0.5 text-green-700">
            <li>We have not tested their skills directly</li>
            <li>We do not guarantee work quality</li>
            <li>We are not responsible for employment disputes</li>
          </ul>
        </div>
      )}
    </div>
  );
}
