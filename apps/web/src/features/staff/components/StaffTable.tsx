/**
 * StaffTable Component
 * Story 2.5-3, AC1: Data table with columns & actions
 */

import { Users } from 'lucide-react';
import { getRoleDisplayName } from '@oslsr/types';
import { SkeletonTable } from '../../../components/skeletons';
import { StaffStatusBadge } from './StaffStatusBadge';
import { StaffActionsMenu } from './StaffActionsMenu';
import type { StaffMember, PaginationMeta } from '../types';

/**
 * Story 13-60 AC3.1 + AC6.3 — the ID-photo state for one staff row.
 *
 * Two facts, deliberately kept separate:
 *   1. CAN a card be printed (`hasPhoto`)? That is the operational question.
 *   2. WHY not, and — when there is a photo — WHICH path produced it.
 *
 * ⚠️ "No photo" is stated WITHOUT blame. `photoStatus === 'failed'` means the
 * system lost it and the person was told; 'skipped' was their choice; null
 * means either the step never applied (back-office) or the account predates
 * this story. Presenting all three as one red "missing" would repeat the
 * original defect — three different situations wearing one face.
 *
 * ⚠️ AND THE PROVENANCE IS *REPORTED*, NOT VERIFIED. `photo_source` is whatever
 * the browser said at upload time; the server has no way to tell a webcam frame
 * from a file. Printing a bare "Live photo" would state as established fact a
 * thing we only have the client's word for — which is the shape of the defect
 * this story fixes one column over (`liveness_score` holding a sharpness
 * ratio). So the label says "reported", and the tooltip says why.
 */
function StaffPhotoCell({ staff }: { staff: StaffMember }) {
  if (staff.hasPhoto) {
    return staff.photoSource === 'upload' ? (
      <span
        className="text-neutral-600"
        title="Uploaded photograph, not a live capture — as reported by the client at upload time; the server cannot verify which path produced an image."
      >
        Uploaded <span className="text-neutral-400">(reported)</span>
      </span>
    ) : (
      <span
        className="text-neutral-600"
        title="Live capture — as reported by the client at upload time; the server cannot verify which path produced an image."
      >
        Live photo <span className="text-neutral-400">(reported)</span>
      </span>
    );
  }

  if (staff.photoStatus === 'failed') {
    return (
      <span
        className="text-warning-600 font-medium"
        title={staff.photoFailureReason ?? 'The photo failed to save during activation'}
      >
        Failed — no card
      </span>
    );
  }

  if (staff.photoStatus === 'skipped') {
    return <span className="text-neutral-600">Skipped — no card</span>;
  }

  // null: back-office (never applied) or an account older than Story 13-60.
  // We do not know which, and we do not guess.
  return <span className="text-neutral-400 italic">None on file</span>;
}

/** Story 13-59 — the operator's words for each artefact, in one place. */
const ARTEFACT_LABEL: Record<string, string> = {
  id_card: 'ID card',
  briefing: 'briefing',
};

/**
 * Story 13-59 AC7.3 — has this person actually TAKEN their artefacts?
 *
 * ⚠️ THIS COMPONENT HOLDS NO OPINION ABOUT WHO OWES WHAT (review H3). It used
 * to: it re-derived the entitlement rules from
 * `['enumerator','supervisor','data_entry_clerk']` written out here, under a
 * comment admitting the array was mirrored from the API. That was the third
 * hand-written copy of a rule that already existed twice, in a story whose own
 * module docblock cites 13-55's five copies.
 *
 * The server now sends the verdict (`artefactsOutstanding`) computed by the
 * same `isOutstanding()` the first-login modal uses, so this cell renders an
 * answer instead of recomputing one. That also fixed a disagreement nobody
 * would have noticed for months (review M2): a person whose photo never saved
 * was told "Not taken: ID card" here forever, while the app had correctly
 * stopped prompting them because they cannot download a card they have no photo
 * for. They belong in 13-60's "No ID photo" column, and only there.
 *
 * ⚠️ Says "Not taken", never "Missing". The person has done nothing wrong — the
 * platform has not yet got the file into their hands, which is the platform's
 * problem to solve, and 13-60's column next door sets the same tone.
 */
function StaffArtefactsCell({ staff }: { staff: StaffMember }) {
  if (!staff.artefactsApplicable) {
    return <span className="text-neutral-400 italic">n/a</span>;
  }

  const outstanding = (staff.artefactsOutstanding ?? []).map((k) => ARTEFACT_LABEL[k] ?? k);

  if (outstanding.length === 0) {
    return <span className="text-success-600">Taken</span>;
  }

  return (
    <span
      className="text-warning-600 font-medium"
      title="This person has not yet downloaded everything they need. They can get it from My Profile → My ID & Field Briefing."
    >
      Not taken: {outstanding.join(', ')}
    </span>
  );
}

interface StaffTableProps {
  data: StaffMember[];
  meta: PaginationMeta | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onResendInvitation: (userId: string) => void;
  onChangeRole: (staff: StaffMember) => void;
  onDeactivate: (staff: StaffMember) => void;
  onReactivate: (staff: StaffMember) => void;
  onDownloadIdCard: (userId: string) => void;
  resendingUserId?: string | null;
  reactivatingUserId?: string | null;
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
  onReactivate,
  onDownloadIdCard,
  resendingUserId,
  reactivatingUserId,
  downloadingUserId,
}: StaffTableProps) {
  if (isLoading) {
    // 8 columns since Story 13-59 added `Artefacts` beside 13-60's `ID photo` —
    // keep this in step with the <th> count or the loading state is visibly
    // narrower than the table.
    return <SkeletonTable rows={10} columns={8} />;
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
              {/*
                * Story 13-60 AC3.1 — answer "who can I print a card for?"
                * BEFORE somebody prints twelve and finds out at the printer.
                */}
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                ID photo
              </th>
              {/*
                * Story 13-59 AC7.3 — the other half of "is this person ready to
                * go out?". 13-60's column answers "can I print a card for
                * them?"; this one answers "did they actually take it?", which
                * is the question the no-attachments ruling created and which
                * nothing else on this screen can answer.
                */}
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Artefacts
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
                    <span>{getRoleDisplayName(staff.roleName)}</span>
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
                <td className="py-3 px-4 text-sm">
                  <StaffPhotoCell staff={staff} />
                </td>
                <td className="py-3 px-4 text-sm">
                  <StaffArtefactsCell staff={staff} />
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-end">
                    <StaffActionsMenu
                      staff={staff}
                      onResendInvitation={onResendInvitation}
                      onChangeRole={onChangeRole}
                      onDeactivate={onDeactivate}
                      onReactivate={onReactivate}
                      onDownloadIdCard={onDownloadIdCard}
                      isResendingInvitation={resendingUserId === staff.id}
                      isReactivating={reactivatingUserId === staff.id}
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
