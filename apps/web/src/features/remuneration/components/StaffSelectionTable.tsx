/**
 * StaffSelectionTable — Staff filter + checkbox selection for payment recording.
 * Story 6.4 AC5: Filter by Role/LGA, select eligible staff for bulk payment.
 */

import { useMemo } from 'react';
import { Checkbox } from '../../../components/ui/checkbox';
import type { EligibleStaff } from '../api/remuneration.api';

interface StaffSelectionTableProps {
  staff: EligibleStaff[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean;
}

/** Mask account number — show only last 4 digits */
function maskAccount(accountNumber: string | null): string {
  if (!accountNumber || accountNumber.length < 4) return '****';
  return '****' + accountNumber.slice(-4);
}

export default function StaffSelectionTable({
  staff,
  selectedIds,
  onSelectionChange,
  isLoading,
}: StaffSelectionTableProps) {
  const selectableStaff = useMemo(
    () => staff.filter((s) => s.bankName && s.accountNumber),
    [staff],
  );

  const allSelected = selectableStaff.length > 0 && selectableStaff.every((s) => selectedIds.includes(s.id));

  function handleSelectAll() {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(selectableStaff.map((s) => s.id));
    }
  }

  function handleToggle(staffId: string) {
    if (selectedIds.includes(staffId)) {
      onSelectionChange(selectedIds.filter((id) => id !== staffId));
    } else {
      onSelectionChange([...selectedIds, staffId]);
    }
  }

  if (isLoading) {
    return (
      <div data-testid="staff-selection-loading" className="py-8 text-center text-muted-foreground">
        Loading staff...
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div data-testid="staff-selection-empty" className="py-8 text-center text-muted-foreground">
        No eligible staff found for the selected filters.
      </div>
    );
  }

  return (
    <div data-testid="staff-selection-table">
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left w-10">
                <Checkbox
                  data-testid="select-all-checkbox"
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all staff"
                />
              </th>
              <th className="p-3 text-left font-medium">Name</th>
              <th className="p-3 text-left font-medium">Email</th>
              <th className="p-3 text-left font-medium">LGA</th>
              <th className="p-3 text-left font-medium">Bank</th>
              <th className="p-3 text-left font-medium">Account</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const hasBankDetails = member.bankName && member.accountNumber;
              const isSelected = selectedIds.includes(member.id);

              return (
                <tr
                  key={member.id}
                  data-testid={`staff-row-${member.id}`}
                  className={`border-b ${!hasBankDetails ? 'opacity-50' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
                >
                  <td className="p-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(member.id)}
                      disabled={!hasBankDetails}
                      aria-label={`Select ${member.fullName}`}
                    />
                  </td>
                  <td className="p-3">{member.fullName || '—'}</td>
                  <td className="p-3 text-muted-foreground">{member.email || '—'}</td>
                  <td className="p-3">{member.lgaName || '—'}</td>
                  <td className="p-3">
                    {hasBankDetails ? member.bankName : (
                      <span className="text-destructive text-xs">No bank details</span>
                    )}
                  </td>
                  <td className="p-3">{maskAccount(member.accountNumber)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {selectedIds.length} of {selectableStaff.length} eligible staff selected
        {staff.length !== selectableStaff.length && (
          <> ({staff.length - selectableStaff.length} without bank details)</>
        )}
      </p>
    </div>
  );
}
