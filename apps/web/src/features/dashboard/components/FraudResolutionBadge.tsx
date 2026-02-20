/**
 * FraudResolutionBadge Component
 * Story 4.4 AC4.4.1: Displays resolution status (unreviewed, false_positive, etc.)
 */

const RESOLUTION_CONFIG: Record<string, { label: string; className: string }> = {
  false_positive: {
    label: 'False Positive',
    className: 'bg-green-100 text-green-700',
  },
  confirmed_fraud: {
    label: 'Confirmed Fraud',
    className: 'bg-red-100 text-red-700',
  },
  needs_investigation: {
    label: 'Needs Investigation',
    className: 'bg-orange-100 text-orange-700',
  },
  dismissed: {
    label: 'Dismissed',
    className: 'bg-neutral-200 text-neutral-500',
  },
  enumerator_warned: {
    label: 'Warned',
    className: 'bg-yellow-100 text-yellow-700',
  },
  enumerator_suspended: {
    label: 'Suspended',
    className: 'bg-red-200 text-red-900',
  },
};

interface FraudResolutionBadgeProps {
  resolution: string | null;
}

export function FraudResolutionBadge({ resolution }: FraudResolutionBadgeProps) {
  if (!resolution) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-neutral-100 text-neutral-500">
        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
        Unreviewed
      </span>
    );
  }

  const config = RESOLUTION_CONFIG[resolution] ?? {
    label: resolution,
    className: 'bg-neutral-100 text-neutral-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {config.label}
    </span>
  );
}
