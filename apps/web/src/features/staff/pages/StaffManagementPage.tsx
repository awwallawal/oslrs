/**
 * StaffManagementPage
 * Story 2.5-3, AC1-AC4: Main staff management page
 */

import { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, Upload, ChevronDown, RefreshCw, CameraOff } from 'lucide-react';
import { getRoleDisplayName } from '@oslsr/types';
import { Card, CardContent } from '../../../components/ui/card';
import { StaffTable, RoleChangeDialog, DeactivateDialog, ReactivateDialog, BulkImportModal, AddStaffModal } from '../components';
import {
  useStaffList,
  useRoles,
  useUpdateRole,
  useDeactivateStaff,
  useReactivateStaff,
  useResendInvitation,
  useDownloadIdCard,
} from '../hooks/useStaff';
import type { StaffMember, UserStatus, ListStaffParams } from '../types';

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

const STATUS_OPTIONS: { value: UserStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'pending_verification', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'verified', label: 'Verified' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deactivated', label: 'Deactivated' },
];

export default function StaffManagementPage() {
  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  /**
   * Story 13-60 AC3.1 — "who will I fail to print an ID card for?", asked
   * BEFORE somebody prints twelve and finds out at the printer.
   *
   * ⚠️ The `ID photo` column alone does not answer this. On a 20-row page the
   * operator has to read every row of every page to find the gaps, which on the
   * morning of a field day is the same as not knowing. The server filter has
   * existed since this story; this is the control that reaches it.
   */
  const [missingPhotoOnly, setMissingPhotoOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Dialog state
  const [roleChangeStaff, setRoleChangeStaff] = useState<StaffMember | null>(null);
  const [deactivateStaff, setDeactivateStaff] = useState<StaffMember | null>(null);
  const [reactivateStaff, setReactivateStaff] = useState<StaffMember | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);

  // Track loading states for individual actions
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);
  const [downloadingUserId, setDownloadingUserId] = useState<string | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(search, 300);

  // Build query params
  const queryParams: ListStaffParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      ...(statusFilter && { status: statusFilter }),
      ...(roleFilter && { roleId: roleFilter }),
      ...(debouncedSearch && { search: debouncedSearch }),
      // Story 13-60 AC3.1 — only sent when on; the server reads strict 'true'.
      ...(missingPhotoOnly && { missingPhoto: true }),
    }),
    [page, statusFilter, roleFilter, debouncedSearch, missingPhotoOnly]
  );

  // Data fetching
  const { data: staffData, isLoading, refetch } = useStaffList(queryParams);
  const { data: rolesData } = useRoles();

  // Mutations
  const updateRoleMutation = useUpdateRole();
  const deactivateMutation = useDeactivateStaff();
  const reactivateMutation = useReactivateStaff();
  const resendInvitationMutation = useResendInvitation();
  const downloadIdCardMutation = useDownloadIdCard();

  // Data
  const staff = staffData?.data ?? [];
  const meta = staffData?.meta;
  const roles = rolesData?.data ?? [];

  // Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value as UserStatus | '');
    setPage(1);
  };

  const handleRoleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(e.target.value);
    setPage(1);
  };

  const handleMissingPhotoToggle = () => {
    setMissingPhotoOnly((on) => !on);
    setPage(1);
  };

  const handleResendInvitation = (userId: string) => {
    setResendingUserId(userId);
    resendInvitationMutation.mutate(userId, {
      onSettled: () => setResendingUserId(null),
    });
  };

  const handleDownloadIdCard = (userId: string) => {
    setDownloadingUserId(userId);
    downloadIdCardMutation.mutate(userId, {
      onSettled: () => setDownloadingUserId(null),
    });
  };

  const handleRoleChangeConfirm = (userId: string, roleId: string) => {
    updateRoleMutation.mutate(
      { userId, roleId },
      {
        onSuccess: () => setRoleChangeStaff(null),
      }
    );
  };

  const handleDeactivateConfirm = (userId: string) => {
    deactivateMutation.mutate(userId, {
      onSuccess: () => setDeactivateStaff(null),
    });
  };

  const handleReactivateConfirm = (userId: string, reOnboard: boolean) => {
    setReactivatingUserId(userId);
    reactivateMutation.mutate({ userId, reOnboard }, {
      onSuccess: () => setReactivateStaff(null),
      onSettled: () => setReactivatingUserId(null),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">
            Staff Management
          </h1>
          <p className="text-neutral-600 mt-1">
            Manage staff accounts, roles, and access permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
            onClick={() => setIsBulkImportOpen(true)}
          >
            <Upload className="w-4 h-4" />
            Bulk Import
          </button>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            onClick={() => setIsAddStaffOpen(true)}
          >
            <UserPlus className="w-4 h-4" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={handleStatusChange}
                className="appearance-none pl-3 pr-10 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[140px]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Role Filter */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={handleRoleFilterChange}
                className="appearance-none pl-3 pr-10 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[140px]"
              >
                <option value="">All Roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {getRoleDisplayName(role.name)}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/*
              * Story 13-60 AC3.1 — the ID-photo gap, in one click.
              *
              * A toggle rather than another dropdown: this is the question an
              * operator asks on ONE morning (the day before a field day), and
              * burying it as a third select would leave it unfound. Pressed
              * state is carried by aria-pressed, not by colour alone.
              */}
            <button
              type="button"
              onClick={handleMissingPhotoToggle}
              aria-pressed={missingPhotoOnly}
              title="Show only staff with no ID-card photo — no card can be printed for them"
              className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                missingPhotoOnly
                  ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <CameraOff className="w-4 h-4" />
              No ID photo
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => refetch()}
              className="inline-flex items-center justify-center p-2 border border-neutral-300 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card>
        <CardContent className="p-4">
          <StaffTable
            data={staff}
            meta={meta}
            isLoading={isLoading}
            page={page}
            onPageChange={setPage}
            onResendInvitation={handleResendInvitation}
            onChangeRole={setRoleChangeStaff}
            onDeactivate={setDeactivateStaff}
            onReactivate={setReactivateStaff}
            onDownloadIdCard={handleDownloadIdCard}
            resendingUserId={resendingUserId}
            reactivatingUserId={reactivatingUserId}
            downloadingUserId={downloadingUserId}
          />
        </CardContent>
      </Card>

      {/* Role Change Dialog */}
      <RoleChangeDialog
        staff={roleChangeStaff}
        isOpen={roleChangeStaff !== null}
        onClose={() => setRoleChangeStaff(null)}
        onConfirm={handleRoleChangeConfirm}
        isLoading={updateRoleMutation.isPending}
      />

      {/* Deactivate Dialog */}
      <DeactivateDialog
        staff={deactivateStaff}
        isOpen={deactivateStaff !== null}
        onClose={() => setDeactivateStaff(null)}
        onConfirm={handleDeactivateConfirm}
        isLoading={deactivateMutation.isPending}
      />

      {/* Reactivate Dialog */}
      <ReactivateDialog
        staff={reactivateStaff}
        isOpen={reactivateStaff !== null}
        onClose={() => setReactivateStaff(null)}
        onConfirm={handleReactivateConfirm}
        isLoading={reactivateMutation.isPending}
      />

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Add Staff Modal */}
      <AddStaffModal
        isOpen={isAddStaffOpen}
        onClose={() => setIsAddStaffOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
