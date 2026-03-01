/**
 * Dispute Status Badge
 * Story 6.6: Visual indicator for dispute lifecycle status.
 * Pattern: FraudSeverityBadge.tsx config map + color scheme.
 */

const DISPUTE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  disputed: { label: 'Disputed', className: 'bg-amber-100 text-amber-700' },
  pending_resolution: { label: 'Pending', className: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-700' },
  reopened: { label: 'Reopened', className: 'bg-orange-100 text-orange-700' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-700' },
};

interface DisputeStatusBadgeProps {
  status: string;
}

export function DisputeStatusBadge({ status }: DisputeStatusBadgeProps) {
  const config = DISPUTE_STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-neutral-100 text-neutral-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.className}`}
      data-testid="dispute-status-badge"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {config.label}
    </span>
  );
}
