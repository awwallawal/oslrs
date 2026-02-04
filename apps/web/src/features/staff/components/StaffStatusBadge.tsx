/**
 * StaffStatusBadge Component
 * Story 2.5-3, AC1: Status badge with color coding
 */

import type { UserStatus } from '../types';

/**
 * Status badge configuration
 */
const STATUS_CONFIG: Record<UserStatus, { label: string; className: string }> = {
  invited: {
    label: 'Invited',
    className: 'bg-yellow-100 text-yellow-700',
  },
  pending_verification: {
    label: 'Pending',
    className: 'bg-orange-100 text-orange-700',
  },
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-700',
  },
  verified: {
    label: 'Verified',
    className: 'bg-blue-100 text-blue-700',
  },
  suspended: {
    label: 'Suspended',
    className: 'bg-red-100 text-red-700',
  },
  deactivated: {
    label: 'Deactivated',
    className: 'bg-neutral-200 text-neutral-500',
  },
};

interface StaffStatusBadgeProps {
  status: UserStatus;
}

export function StaffStatusBadge({ status }: StaffStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
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
