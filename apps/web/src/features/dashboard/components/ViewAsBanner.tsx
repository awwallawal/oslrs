/**
 * ViewAsBanner — Non-dismissible banner showing View-As mode status
 *
 * Displays "Viewing as: [Role] — Read Only" with admin identity
 * and an "Exit View-As" button. Uses amber/gold color scheme.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getRoleDisplayName } from '@oslsr/types';
import { useViewAs } from '../context/ViewAsContext';
import { useAuth } from '../../auth/context/AuthContext';
import { fetchLgas } from '../api/export.api';

export function ViewAsBanner() {
  const { targetRole, targetLgaId, exitViewAs } = useViewAs();
  const { user } = useAuth();

  const roleDisplayName = targetRole ? getRoleDisplayName(targetRole) : 'Unknown';
  const adminName = user?.fullName ?? user?.email ?? 'Admin';

  // Look up LGA name from cached query (populated by ViewAsPage)
  const { data: lgas } = useQuery({
    queryKey: ['lgas'],
    queryFn: fetchLgas,
    enabled: !!targetLgaId,
    staleTime: 5 * 60 * 1000,
  });
  const lgaName = targetLgaId ? lgas?.find((l) => l.id === targetLgaId)?.name : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="view-as-banner"
      className="flex items-center justify-between bg-amber-500 px-4 py-2 text-white"
    >
      <div className="flex items-center gap-2">
        <Eye className="h-5 w-5 shrink-0" />
        <span className="font-semibold">
          Viewing as: {roleDisplayName} — Read Only
        </span>
        <span className="ml-2 text-sm text-amber-100">
          Logged in as: {adminName}
          {targetLgaId && ` | LGA: ${lgaName ?? 'Loading...'}`}
        </span>
      </div>
      <button
        onClick={exitViewAs}
        data-testid="exit-view-as"
        className="shrink-0 rounded border border-white px-3 py-1 text-sm font-medium text-white hover:bg-amber-600"
      >
        Exit View-As
      </button>
    </div>
  );
}
