import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SkeletonForm } from '../../../components/skeletons';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
  fallback?: React.ReactNode;
}

/**
 * Loading fallback component for protected routes
 */
function AuthLoadingFallback() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <SkeletonForm fields={2} />
      </div>
    </div>
  );
}

/**
 * ProtectedRoute component
 *
 * Wraps routes that require authentication. Redirects unauthenticated users
 * to the login page and optionally enforces role-based access control.
 *
 * @example
 * // Basic protected route
 * <ProtectedRoute>
 *   <DashboardPage />
 * </ProtectedRoute>
 *
 * @example
 * // Role-restricted route
 * <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
 *   <AdminPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/login',
  fallback,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return fallback ? <>{fallback}</> : <AuthLoadingFallback />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Preserve the intended destination for post-login redirect
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  // Check role-based access
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to unauthorized page or home
    return (
      <Navigate
        to="/unauthorized"
        state={{ from: location.pathname, requiredRoles: allowedRoles }}
        replace
      />
    );
  }

  // User is authenticated and authorized
  return <>{children}</>;
}

/**
 * PublicOnlyRoute component
 *
 * Wraps routes that should only be accessible to unauthenticated users
 * (e.g., login page). Redirects authenticated users to the home page
 * or their intended destination.
 *
 * @example
 * <PublicOnlyRoute>
 *   <LoginPage />
 * </PublicOnlyRoute>
 */
interface PublicOnlyRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  fallback?: React.ReactNode;
}

export function PublicOnlyRoute({
  children,
  redirectTo = '/',
  fallback,
}: PublicOnlyRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return fallback ? <>{fallback}</> : <AuthLoadingFallback />;
  }

  // Redirect to home/dashboard if already authenticated
  if (isAuthenticated) {
    // Check if there's a stored destination
    const from = (location.state as any)?.from || redirectTo;
    return <Navigate to={from} replace />;
  }

  // User is not authenticated, show the public route
  return <>{children}</>;
}

/**
 * RoleGate component
 *
 * Conditionally renders children based on user role.
 * Useful for hiding/showing UI elements based on permissions.
 *
 * @example
 * <RoleGate allowedRoles={['admin']}>
 *   <AdminControls />
 * </RoleGate>
 */
interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles: string[];
  fallback?: React.ReactNode;
}

export function RoleGate({ children, allowedRoles, fallback = null }: RoleGateProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <>{fallback}</>;
  }

  if (!allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
