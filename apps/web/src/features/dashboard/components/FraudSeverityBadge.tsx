/**
 * FraudSeverityBadge Component
 * Story 4.4 AC4.4.7: Color-coded severity chip following StaffStatusBadge pattern.
 */

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  clean: {
    label: 'Clean',
    className: 'bg-green-100 text-green-700',
  },
  low: {
    label: 'Low',
    className: 'bg-yellow-100 text-yellow-700',
  },
  medium: {
    label: 'Medium',
    className: 'bg-orange-100 text-orange-700',
  },
  high: {
    label: 'High',
    className: 'bg-red-100 text-red-700',
  },
  critical: {
    label: 'Critical',
    className: 'bg-red-200 text-red-900',
  },
};

interface FraudSeverityBadgeProps {
  severity: string;
}

export function FraudSeverityBadge({ severity }: FraudSeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity] ?? {
    label: severity,
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
