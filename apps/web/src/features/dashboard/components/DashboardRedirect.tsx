/**
 * DashboardRedirect Component
 *
 * Story 2.5-1 AC2: Root Dashboard Redirect
 *
 * Redirects users from the root /dashboard route to their role-specific dashboard.
 * This ensures each user lands on their appropriate dashboard home page.
 *
 * Role → Route Mapping:
 * - super_admin → /dashboard/super-admin
 * - supervisor → /dashboard/supervisor
 * - enumerator → /dashboard/enumerator
 * - clerk → /dashboard/clerk
 * - assessor → /dashboard/assessor
 * - official → /dashboard/official
 * - public_user → /dashboard/public
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/AuthContext';
import { getDashboardRoute } from '../config/sidebarConfig';
import { PageSkeleton } from '../../../components/skeletons';

export function DashboardRedirect() {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Show skeleton while loading auth state
  if (isLoading) {
    return <PageSkeleton variant="dashboard" showHeader={false} showFooter={false} />;
  }

  // Redirect to homepage if not authenticated (should be caught by ProtectedRoute, but just in case)
  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }

  // Get the appropriate dashboard route for the user's role
  const targetRoute = getDashboardRoute(user.role);

  // Redirect to role-specific dashboard
  return <Navigate to={targetRoute} replace />;
}
