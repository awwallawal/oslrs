/**
 * ViewAsContext — React context for View-As mode state management
 *
 * Provides View-As state and actions to child components within
 * the View-As route subtree. Does NOT override useAuth() — the
 * Super Admin's real identity is always preserved.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { createContext, useContext, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useViewAsState, useEndViewAs } from '../hooks/useViewAs';
import { useToast } from '../../../hooks/useToast';

interface ViewAsContextValue {
  isViewingAs: boolean;
  targetRole: string | null;
  targetLgaId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  exitViewAs: () => void;
  blockAction: (actionName?: string) => boolean;
  isLoading: boolean;
}

const ViewAsContext = createContext<ViewAsContextValue | undefined>(undefined);

interface ViewAsProviderProps {
  children: ReactNode;
}

export function ViewAsProvider({ children }: ViewAsProviderProps) {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const { warning } = useToast();
  const { data: viewAsState, isLoading } = useViewAsState();
  const endViewAsMutation = useEndViewAs();

  const isViewingAs = viewAsState?.active === true;
  const targetRole = viewAsState?.targetRole ?? null;
  const targetLgaId = viewAsState?.targetLgaId ?? null;
  const startedAt = viewAsState?.startedAt ?? null;
  const expiresAt = viewAsState?.expiresAt ?? null;

  // Stable ref for mutation to avoid re-triggering timer on reference changes
  const endMutateRef = useRef(endViewAsMutation.mutate);
  endMutateRef.current = endViewAsMutation.mutate;

  // Auto-expire: if expiresAt passes, exit View-As
  useEffect(() => {
    if (!expiresAt) return;
    const expiresAtMs = new Date(expiresAt).getTime();
    const now = Date.now();
    const remaining = expiresAtMs - now;

    if (remaining <= 0) {
      endMutateRef.current();
      return;
    }

    const timer = setTimeout(() => {
      endMutateRef.current();
    }, remaining);

    return () => clearTimeout(timer);
  }, [expiresAt]);

  // Redirect to admin dashboard if not in View-As mode (session expired or not started)
  useEffect(() => {
    if (!isLoading && !isViewingAs && role) {
      navigate('/dashboard/super-admin/view-as', { replace: true });
    }
  }, [isLoading, isViewingAs, role, navigate]);

  const exitViewAs = useCallback(() => {
    endViewAsMutation.mutate();
  }, [endViewAsMutation]);

  const blockAction = useCallback(
    (actionName?: string) => {
      if (!isViewingAs) return false;
      warning({
        message: 'Actions disabled in View-As mode',
        description: actionName ? `Cannot ${actionName} while viewing as another role` : undefined,
      });
      return true;
    },
    [isViewingAs, warning],
  );

  const value = useMemo<ViewAsContextValue>(
    () => ({
      isViewingAs,
      targetRole,
      targetLgaId,
      startedAt,
      expiresAt,
      exitViewAs,
      blockAction,
      isLoading,
    }),
    [isViewingAs, targetRole, targetLgaId, startedAt, expiresAt, exitViewAs, blockAction, isLoading],
  );

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsContextValue {
  const context = useContext(ViewAsContext);
  if (context === undefined) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return context;
}
