/**
 * StaffTable Component
 * Story 2.5-3, AC1: Data table with columns & actions
 */

import { Users } from 'lucide-react';
import { SkeletonTable } from '../../../components/skeletons';
import { StaffStatusBadge } from './StaffStatusBadge';
import { StaffActionsMenu } from './StaffActionsMenu';
import type { StaffMember, PaginationMeta } from '../types';

interface StaffTableProps {
  data: StaffMember[];
  meta: PaginationMeta | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onResendInvitation: (userId: string) => void;
  onChangeRole: (staff: StaffMember) => void;
  onDeactivate: (staff: StaffMember) => void;
  onDownloadIdCard: (userId: string) => void;
  resendingUserId?: string | null;
  downloadingUserId?: string | null;
}

export function StaffTable({
  data,
  meta,
  isLoading,
  page,
  onPageChange,
  onResendInvitation,
  onChangeRole,
  onDeactivate,
  onDownloadIdCard,
  resendingUserId,
  downloadingUserId,
}: StaffTableProps) {
  if (isLoading) {
    return <SkeletonTable rows={10} columns={6} />;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <Users className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <p className="font-medium">No staff members found</p>
        <p className="text-sm mt-1">
          Try adjusting your search or filters, or add staff members using the buttons above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full">
          <thead className="bg-neutral-50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Name
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Email
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Role
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                LGA
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Status
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {data.map((staff) => (
              <tr key={staff.id} className="hover:bg-neutral-50">
                <td className="py-3 px-4 text-sm font-medium text-neutral-900">
                  {staff.fullName}
                </td>
                <td className="py-3 px-4 text-sm text-neutral-600">
                  {staff.email}
                </td>
                <td className="py-3 px-4 text-sm text-neutral-600">
                  {staff.roleName ? (
                    <span className="capitalize">
                      {staff.roleName.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="text-neutral-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-neutral-600">
                  {staff.lgaName ?? (
                    <span className="text-neutral-400 italic">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <StaffStatusBadge status={staff.status} />
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-end">
                    <StaffActionsMenu
                      staff={staff}
                      onResendInvitation={onResendInvitation}
                      onChangeRole={onChangeRole}
                      onDeactivate={onDeactivate}
                      onDownloadIdCard={onDownloadIdCard}
                      isResendingInvitation={resendingUserId === staff.id}
                      isDownloadingIdCard={downloadingUserId === staff.id}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(Math.min(meta.totalPages, page + 1))}
              disabled={page >= meta.totalPages}
              className="px-3 py-1.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
