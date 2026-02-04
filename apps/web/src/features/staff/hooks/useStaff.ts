/**
 * Staff TanStack Query Hooks
 * Story 2.5-3: Custom hooks for Staff Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import {
  listStaff,
  listRoles,
  listLgas,
  updateStaffRole,
  deactivateStaff,
  resendInvitation,
  downloadStaffIdCard,
  importStaffCsv,
  getImportStatus,
  createStaffManual,
} from '../api/staff.api';
import type { ListStaffParams } from '../types';

/**
 * Query key factory for staff queries
 * Ensures consistent cache invalidation across the module
 */
export const staffKeys = {
  all: ['staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (params: ListStaffParams) => [...staffKeys.lists(), params] as const,
  details: () => [...staffKeys.all, 'detail'] as const,
  detail: (id: string) => [...staffKeys.details(), id] as const,
};

/**
 * Query key factory for roles
 */
export const rolesKeys = {
  all: ['roles'] as const,
};

/**
 * Query key factory for LGAs
 */
export const lgasKeys = {
  all: ['lgas'] as const,
};

/**
 * Fetch paginated staff list with filtering and search
 */
export function useStaffList(params: ListStaffParams = {}) {
  return useQuery({
    queryKey: staffKeys.list(params),
    queryFn: () => listStaff(params),
  });
}

/**
 * Fetch all available roles for dropdowns
 * Cached for 5 minutes since roles rarely change
 */
export function useRoles() {
  return useQuery({
    queryKey: rolesKeys.all,
    queryFn: listRoles,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch all available LGAs for dropdowns
 * Cached for 5 minutes since LGAs rarely change
 */
export function useLgas() {
  return useQuery({
    queryKey: lgasKeys.all,
    queryFn: listLgas,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update a user's role
 * Invalidates staff cache and shows toast on success/error
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      updateStaffRole(userId, roleId),
    onSuccess: () => {
      success({ message: 'Role updated successfully' });
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to update role' });
    },
  });
}

/**
 * Deactivate a user
 * Invalidates staff cache and shows toast on success/error
 */
export function useDeactivateStaff() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: deactivateStaff,
    onSuccess: () => {
      success({ message: 'User deactivated successfully' });
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'CANNOT_DEACTIVATE_SELF') {
        showError({ message: 'You cannot deactivate your own account' });
      } else if (err.code === 'ALREADY_DEACTIVATED') {
        showError({ message: 'User is already deactivated' });
      } else {
        showError({ message: err.message || 'Failed to deactivate user' });
      }
    },
  });
}

/**
 * Resend invitation email
 * Shows toast with remaining resends on success
 */
export function useResendInvitation() {
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: resendInvitation,
    onSuccess: (data) => {
      const message = data.data.remainingResends !== undefined
        ? `${data.data.message}. ${data.data.remainingResends} resends remaining today.`
        : data.data.message;
      success({ message });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'RESEND_LIMIT_EXCEEDED') {
        showError({ message: 'Daily resend limit exceeded. Please try again tomorrow.' });
      } else {
        showError({ message: err.message || 'Failed to resend invitation' });
      }
    },
  });
}

/**
 * Download ID card for a staff member
 * Triggers browser download on success
 */
export function useDownloadIdCard() {
  const { error: showError } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const blob = await downloadStaffIdCard(userId);
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `id-card-${userId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'USER_NOT_FOUND') {
        showError({ message: 'User not found' });
      } else if (err.code === 'NO_SELFIE') {
        showError({ message: 'User has not uploaded a selfie. ID card cannot be generated.' });
      } else {
        showError({ message: err.message || 'Failed to download ID card' });
      }
    },
  });
}

/**
 * Create a single staff member manually
 */
export function useCreateStaffManual() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: createStaffManual,
    onSuccess: (data) => {
      success({ message: `Staff member "${data.data.fullName}" created and invitation sent` });
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'DUPLICATE_EMAIL') {
        showError({ message: 'A user with this email already exists' });
      } else {
        showError({ message: err.message || 'Failed to create staff member' });
      }
    },
  });
}

/**
 * Import staff from CSV file
 */
export function useImportStaffCsv() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: importStaffCsv,
    onSuccess: (data) => {
      if (data.data.status === 'completed') {
        success({
          message: `Import complete: ${data.data.createdCount} created, ${data.data.skippedCount} skipped`,
        });
        queryClient.invalidateQueries({ queryKey: staffKeys.all });
      }
      // For 'processing' status, caller will poll for completion
    },
    onError: (err: Error & { code?: string; details?: unknown }) => {
      if (err.code === 'INVALID_CSV_FORMAT') {
        showError({ message: 'Invalid CSV format. Please check the template.' });
      } else if (err.code === 'FILE_TOO_LARGE') {
        showError({ message: 'File exceeds 5MB limit' });
      } else {
        showError({ message: err.message || 'Import failed' });
      }
    },
  });
}

/**
 * Poll import job status
 */
export function useImportStatus(jobId: string | null, enabled: boolean = false) {
  return useQuery({
    queryKey: ['staff', 'import', jobId],
    queryFn: () => getImportStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      // Stop polling when job is complete or failed
      const status = query.state.data?.data?.status;
      if (status === 'completed' || status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });
}
