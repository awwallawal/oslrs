import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TOAST_CONFIG } from './hooks/useToast';
import { SkeletonForm } from './components/skeletons';
import { AuthProvider, PublicOnlyRoute, ProtectedRoute, ReAuthModal } from './features/auth';

// Lazy load page components for code splitting and loading indicators
const ActivationPage = lazy(() => import('./features/auth/pages/ActivationPage'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const StaffLoginPage = lazy(() => import('./features/auth/pages/StaffLoginPage'));
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./features/auth/pages/ResetPasswordPage'));
const ProfileCompletionPage = lazy(() => import('./features/onboarding/pages/ProfileCompletionPage'));
const VerificationPage = lazy(() => import('./features/onboarding/pages/VerificationPage'));
const RegistrationPage = lazy(() => import('./features/auth/pages/RegistrationPage'));
const VerifyEmailPage = lazy(() => import('./features/auth/pages/VerifyEmailPage'));
const ResendVerificationPage = lazy(() => import('./features/auth/pages/ResendVerificationPage'));

/**
 * Page loading fallback - shows skeleton during route transitions
 * Implements AC11: "subtle loading indicator should appear during page transitions"
 */
function PageLoadingFallback() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <SkeletonForm fields={3} />
      </div>
    </div>
  );
}

/**
 * Home page - placeholder for authenticated home/dashboard
 */
function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-h1 text-primary-600 font-brand mb-4">OSLSR</h1>
        <p className="text-body text-neutral-700">Oyo State Labour & Skills Registry</p>
      </div>
    </div>
  );
}

/**
 * Unauthorized page - shown when user doesn't have required role
 */
function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Access Denied</h1>
        <p className="text-neutral-600 mb-6">
          You don't have permission to access this page.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Application Error',
        description: 'Something went wrong. Please refresh the page or contact support.',
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/activate/:token" element={<ActivationPage />} />
              <Route path="/verify-staff/:id" element={<VerificationPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/* Auth Routes - Public Only (redirect if authenticated) */}
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <LoginPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/staff/login"
                element={
                  <PublicOnlyRoute redirectTo="/admin">
                    <StaffLoginPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <ForgotPasswordPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/reset-password/:token"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <ResetPasswordPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <RegistrationPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/verify-email/:token"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <VerifyEmailPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/resend-verification"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <ResendVerificationPage />
                  </PublicOnlyRoute>
                }
              />

              {/* Protected Routes - Require Authentication */}
              <Route
                path="/profile-completion"
                element={
                  <ProtectedRoute redirectTo="/login">
                    <ProfileCompletionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute redirectTo="/login">
                    <div className="min-h-screen bg-neutral-50 p-6">
                      <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
                      <p className="text-neutral-600 mt-2">Welcome to your dashboard.</p>
                    </div>
                  </ProtectedRoute>
                }
              />

              {/* Admin Routes - Require Staff Role */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute
                    redirectTo="/staff/login"
                    allowedRoles={['admin', 'super_admin', 'supervisor', 'enumerator']}
                  >
                    <div className="min-h-screen bg-neutral-50 p-6">
                      <h1 className="text-2xl font-semibold text-neutral-900">Admin Portal</h1>
                      <p className="text-neutral-600 mt-2">Welcome to the admin portal.</p>
                    </div>
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          {/* Global Re-Authentication Modal */}
          <ReAuthModal />
        </AuthProvider>
      </BrowserRouter>

      {/* Toast notifications - positioned top-right with Oyo State theme */}
      <Toaster
        position="top-right"
        visibleToasts={TOAST_CONFIG.MAX_VISIBLE}
        closeButton
        richColors
        toastOptions={{
          className: 'font-ui',
          style: {
            fontFamily: 'var(--font-ui)',
          },
        }}
      />
    </ErrorBoundary>
  );
}

export default App;
