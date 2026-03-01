/**
 * ViewAsPage — Role selector page for Super Admin View-As feature
 *
 * Displays a grid of viewable roles. For field roles (Enumerator, Supervisor),
 * requires LGA selection. Optional reason field for audit trail.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, ClipboardList, Keyboard, ShieldCheck, Building2 } from 'lucide-react';
import { useStartViewAs } from '../hooks/useViewAs';
import { fetchLgas, type LgaItem } from '../api/export.api';

const VIEWABLE_ROLES = [
  {
    role: 'supervisor',
    label: 'Supervisor',
    description: 'Team management, productivity tracking, fraud alerts',
    icon: Users,
    needsLga: true,
  },
  {
    role: 'enumerator',
    label: 'Enumerator',
    description: 'Survey filling, drafts, sync status, messaging',
    icon: ClipboardList,
    needsLga: true,
  },
  {
    role: 'data_entry_clerk',
    label: 'Data Entry Clerk',
    description: 'Keyboard-optimized data entry, queue management',
    icon: Keyboard,
    needsLga: false,
  },
  {
    role: 'verification_assessor',
    label: 'Verification Assessor',
    description: 'Audit queue, evidence review, fraud detection',
    icon: ShieldCheck,
    needsLga: false,
  },
  {
    role: 'government_official',
    label: 'Government Official',
    description: 'Policy dashboard, statistics, trends, exports',
    icon: Building2,
    needsLga: false,
  },
] as const;

export default function ViewAsPage() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string>('');
  const [reason, setReason] = useState('');
  const startViewAs = useStartViewAs();

  const selectedRoleConfig = VIEWABLE_ROLES.find((r) => r.role === selectedRole);
  const needsLga = selectedRoleConfig?.needsLga ?? false;

  const { data: lgas = [] } = useQuery<LgaItem[]>({
    queryKey: ['lgas'],
    queryFn: fetchLgas,
    enabled: needsLga,
  });

  const canStart = selectedRole && (!needsLga || selectedLga);

  const handleStart = () => {
    if (!selectedRole) return;
    startViewAs.mutate({
      targetRole: selectedRole,
      targetLgaId: needsLga ? selectedLga : undefined,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6 p-6" data-testid="view-as-page">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">View As</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Preview what another role's dashboard looks like. All actions are disabled in read-only mode.
        </p>
      </div>

      {/* Role Selector Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="role-grid">
        {VIEWABLE_ROLES.map(({ role, label, description, icon: Icon }) => (
          <button
            key={role}
            onClick={() => {
              setSelectedRole(role);
              setSelectedLga('');
            }}
            data-testid={`role-card-${role}`}
            className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors ${
              selectedRole === role
                ? 'border-amber-500 bg-amber-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            }`}
          >
            <Icon
              className={`mt-0.5 h-6 w-6 shrink-0 ${
                selectedRole === role ? 'text-amber-600' : 'text-neutral-400'
              }`}
            />
            <div>
              <p className="font-medium text-neutral-900">{label}</p>
              <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* LGA Selector (for field roles) */}
      {needsLga && (
        <div data-testid="lga-selector">
          <label htmlFor="lga-select" className="block text-sm font-medium text-neutral-700">
            Select LGA to view as
          </label>
          <select
            id="lga-select"
            value={selectedLga}
            onChange={(e) => setSelectedLga(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Select LGA...</option>
            {lgas.map((lga) => (
              <option key={lga.id} value={lga.id}>
                {lga.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reason Field */}
      {selectedRole && (
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-neutral-700">
            Reason for viewing (optional)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="e.g., Debugging reported issue, Stakeholder demo, User support"
            rows={2}
            className="mt-1 block w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <p className="mt-1 text-xs text-neutral-400">{reason.length}/500</p>
        </div>
      )}

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!canStart || startViewAs.isPending}
        data-testid="start-view-as"
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {startViewAs.isPending ? 'Starting...' : 'Start Viewing'}
      </button>
    </div>
  );
}
