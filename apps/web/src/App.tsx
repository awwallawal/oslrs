import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TOAST_CONFIG } from './hooks/useToast';
import { PageSkeleton } from './components/skeletons';
import { AuthProvider, PublicOnlyRoute, ProtectedRoute, ReAuthModal } from './features/auth';
import { PublicLayout, AuthLayout } from './layouts';

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

// Lazy load HomePage for code splitting
const HomePage = lazy(() => import('./features/home'));

/**
 * Page loading fallback - shows full page skeleton during route transitions
 */
function PageLoadingFallback() {
  return <PageSkeleton variant="default" />;
}

/**
 * Auth page loading fallback - shows form skeleton for auth pages
 */
function AuthLoadingFallback() {
  return <PageSkeleton variant="form" showHeader={false} showFooter={false} />;
}

/**
 * Placeholder page component for routes not yet implemented
 */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-brand font-semibold text-neutral-900 mb-4">{title}</h1>
        <p className="text-neutral-600">
          This page is coming soon. Check back later for updates.
        </p>
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            {/* ============================================
             * PUBLIC ROUTES - Wrapped in PublicLayout
             * ============================================ */}
            <Route element={<PublicLayout />}>
              <Route
                index
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <HomePage />
                  </Suspense>
                }
              />

              {/* About Section */}
              <Route path="about">
                <Route
                  index
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="About The Initiative" />
                    </Suspense>
                  }
                />
                <Route
                  path="how-it-works"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="How It Works" />
                    </Suspense>
                  }
                />
                <Route
                  path="leadership"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="Leadership" />
                    </Suspense>
                  }
                />
                <Route
                  path="partners"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="Partners" />
                    </Suspense>
                  }
                />
                <Route
                  path="privacy"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="Privacy Policy" />
                    </Suspense>
                  }
                />
              </Route>

              {/* Participate Section */}
              <Route path="participate">
                <Route
                  index
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="Participate" />
                    </Suspense>
                  }
                />
                <Route
                  path="workers"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="For Workers" />
                    </Suspense>
                  }
                />
                <Route
                  path="employers"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PlaceholderPage title="For Employers" />
                    </Suspense>
                  }
                />
              </Route>

              {/* Support Page */}
              <Route
                path="support"
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <PlaceholderPage title="Support" />
                  </Suspense>
                }
              />

              {/* Terms Page */}
              <Route
                path="terms"
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <PlaceholderPage title="Terms of Service" />
                  </Suspense>
                }
              />

              {/* Marketplace (placeholder for Epic 7) */}
              <Route
                path="marketplace"
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <PlaceholderPage title="Skills Marketplace" />
                  </Suspense>
                }
              />

              {/* Public Staff Verification */}
              <Route
                path="verify-staff/:id"
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <VerificationPage />
                  </Suspense>
                }
              />
            </Route>

            {/* ============================================
             * AUTH ROUTES - Wrapped in AuthLayout
             * ============================================ */}
            <Route element={<AuthLayout />}>
              <Route
                path="login"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <LoginPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="staff/login"
                element={
                  <PublicOnlyRoute redirectTo="/admin">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <StaffLoginPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="register"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <RegistrationPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="forgot-password"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <ForgotPasswordPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="reset-password/:token"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <ResetPasswordPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="verify-email/:token"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <VerifyEmailPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="resend-verification"
                element={
                  <PublicOnlyRoute redirectTo="/dashboard">
                    <Suspense fallback={<AuthLoadingFallback />}>
                      <ResendVerificationPage />
                    </Suspense>
                  </PublicOnlyRoute>
                }
              />
            </Route>

            {/* ============================================
             * SPECIAL ROUTES - No layout wrapper
             * ============================================ */}
            {/* Staff Activation (uses own minimal layout) */}
            <Route
              path="activate/:token"
              element={
                <Suspense fallback={<AuthLoadingFallback />}>
                  <ActivationPage />
                </Suspense>
              }
            />

            {/* Unauthorized Page */}
            <Route path="unauthorized" element={<UnauthorizedPage />} />

            {/* ============================================
             * PROTECTED ROUTES - Require Authentication
             * (Dashboard layout to be implemented in future epic)
             * ============================================ */}
            <Route
              path="profile-completion"
              element={
                <ProtectedRoute redirectTo="/login">
                  <Suspense fallback={<PageLoadingFallback />}>
                    <ProfileCompletionPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="dashboard"
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
              path="admin"
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
