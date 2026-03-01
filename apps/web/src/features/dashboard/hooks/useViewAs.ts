/**
 * View-As Hooks — TanStack Query hooks for View-As feature
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  startViewAs,
  endViewAs,
  getCurrentViewAs,
  getViewAsDashboardData,
  type StartViewAsRequest,
} from '../api/view-as.api';
import { useToast } from '../../../hooks/useToast';

export const viewAsKeys = {
  all: ['viewAs'] as const,
  current: () => [...viewAsKeys.all, 'current'] as const,
  dashboard: () => [...viewAsKeys.all, 'dashboard'] as const,
  sidebar: () => [...viewAsKeys.all, 'sidebar'] as const,
};

/** Query current View-As state — staleTime: 0 (always fresh) */
export function useViewAsState() {
  return useQuery({
    queryKey: viewAsKeys.current(),
    queryFn: getCurrentViewAs,
    staleTime: 0,
  });
}

/** Mutation to start a View-As session */
export function useStartViewAs() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: (data: StartViewAsRequest) => startViewAs(data),
    onSuccess: (result) => {
      success({ message: `Now viewing as ${result.targetRole?.replace(/_/g, ' ')}` });
      queryClient.invalidateQueries({ queryKey: viewAsKeys.all });
      if (result.targetRole) {
        navigate(`/dashboard/super-admin/view-as/${result.targetRole}`);
      }
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'VIEW_AS_ALREADY_ACTIVE') {
        showError({ message: 'A View-As session is already active. End it first.' });
      } else {
        showError({ message: err.message || 'Failed to start View-As session' });
      }
    },
  });
}

/** Mutation to end the current View-As session */
export function useEndViewAs() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  return useMutation({
    mutationFn: endViewAs,
    onSuccess: (result) => {
      const minutes = result.duration ? Math.round(result.duration / 60) : 0;
      success({ message: `View-As session ended (${minutes} min)` });
      queryClient.invalidateQueries({ queryKey: viewAsKeys.all });
      navigate('/dashboard/super-admin');
    },
    onError: (err: Error) => {
      showError({ message: err.message || 'Failed to end View-As session' });
    },
  });
}

/** Query dashboard data for View-As mode */
export function useViewAsDashboardData(enabled = true) {
  return useQuery({
    queryKey: viewAsKeys.dashboard(),
    queryFn: getViewAsDashboardData,
    enabled,
    staleTime: 30_000,
  });
}
