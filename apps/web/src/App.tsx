import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TOAST_CONFIG } from './hooks/useToast';
import { PageSkeleton } from './components/skeletons';
import { AuthProvider, PublicOnlyRoute, ProtectedRoute, ReAuthModal } from './features/auth';
import { PublicLayout, AuthLayout, DashboardLayout } from './layouts';
import { DashboardRedirect } from './features/dashboard';

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

// Lazy load About pages for code splitting
const AboutLandingPage = lazy(() => import('./features/about/pages/AboutLandingPage'));
const InitiativePage = lazy(() => import('./features/about/pages/InitiativePage'));
const HowItWorksPage = lazy(() => import('./features/about/pages/HowItWorksPage'));
const LeadershipPage = lazy(() => import('./features/about/pages/LeadershipPage'));
const PartnersPage = lazy(() => import('./features/about/pages/PartnersPage'));
const PrivacyPage = lazy(() => import('./features/about/pages/PrivacyPage'));

// Lazy load Participate pages for code splitting
const ParticipateLandingPage = lazy(() => import('./features/participate/pages/ParticipateLandingPage'));
const WorkersPage = lazy(() => import('./features/participate/pages/WorkersPage'));
const EmployersPage = lazy(() => import('./features/participate/pages/EmployersPage'));

// Lazy load Support pages for code splitting
const SupportLandingPage = lazy(() => import('./features/support/pages/SupportLandingPage'));
const FAQPage = lazy(() => import('./features/support/pages/FAQPage'));
const GuidesPage = lazy(() => import('./features/support/pages/GuidesPage'));
const ContactPage = lazy(() => import('./features/support/pages/ContactPage'));
const VerifyWorkerPage = lazy(() => import('./features/support/pages/VerifyWorkerPage'));

// Lazy load Guide detail pages for code splitting - Story 1.5.7
const GuideRegisterPage = lazy(() => import('./features/support/pages/guides/GuideRegisterPage'));
const GuideSurveyPage = lazy(() => import('./features/support/pages/guides/GuideSurveyPage'));
const GuideMarketplaceOptInPage = lazy(() => import('./features/support/pages/guides/GuideMarketplaceOptInPage'));
const GuideGetNinPage = lazy(() => import('./features/support/pages/guides/GuideGetNinPage'));
const GuideSearchMarketplacePage = lazy(() => import('./features/support/pages/guides/GuideSearchMarketplacePage'));
const GuideEmployerAccountPage = lazy(() => import('./features/support/pages/guides/GuideEmployerAccountPage'));
const GuideVerifyWorkerPage = lazy(() => import('./features/support/pages/guides/GuideVerifyWorkerPage'));

// Lazy load Legal pages for code splitting
const TermsPage = lazy(() => import('./features/legal/pages/TermsPage'));

// Lazy load Questionnaire Management page (Story 2-1)
const QuestionnaireManagementPage = lazy(() => import('./features/questionnaires/pages/QuestionnaireManagementPage'));

// Lazy load Dashboard pages (Story 2.5-1)
const SuperAdminHome = lazy(() => import('./features/dashboard/pages/SuperAdminHome'));
const SupervisorHome = lazy(() => import('./features/dashboard/pages/SupervisorHome'));
const EnumeratorHome = lazy(() => import('./features/dashboard/pages/EnumeratorHome'));
const ClerkHome = lazy(() => import('./features/dashboard/pages/ClerkHome'));
const AssessorHome = lazy(() => import('./features/dashboard/pages/AssessorHome'));
const OfficialHome = lazy(() => import('./features/dashboard/pages/OfficialHome'));
const PublicUserHome = lazy(() => import('./features/dashboard/pages/PublicUserHome'));
const ProfilePage = lazy(() => import('./features/dashboard/pages/ProfilePage'));

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
 * Dashboard page loading fallback - shows dashboard skeleton
 */
function DashboardLoadingFallback() {
  return <PageSkeleton variant="dashboard" showHeader={false} showFooter={false} />;
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <ErrorBoundary
      fallbackProps={{
        title: 'Application Error',
        description: 'Something went wrong. Please refresh the page or contact support.',
      }}
    >
      <QueryClientProvider client={queryClient}>
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
                      <AboutLandingPage />
                    </Suspense>
                  }
                />
                <Route
                  path="initiative"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <InitiativePage />
                    </Suspense>
                  }
                />
                <Route
                  path="how-it-works"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <HowItWorksPage />
                    </Suspense>
                  }
                />
                <Route
                  path="leadership"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <LeadershipPage />
                    </Suspense>
                  }
                />
                <Route
                  path="partners"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PartnersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="privacy"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <PrivacyPage />
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
                      <ParticipateLandingPage />
                    </Suspense>
                  }
                />
                <Route
                  path="workers"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <WorkersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="employers"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <EmployersPage />
                    </Suspense>
                  }
                />
              </Route>

              {/* Support Section */}
              <Route path="support">
                <Route
                  index
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <SupportLandingPage />
                    </Suspense>
                  }
                />
                <Route
                  path="faq"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <FAQPage />
                    </Suspense>
                  }
                />
                {/* Guides Section - Story 1.5.7 AC9 */}
                <Route path="guides">
                  <Route
                    index
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuidesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="register"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideRegisterPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="survey"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideSurveyPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="marketplace-opt-in"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideMarketplaceOptInPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="get-nin"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideGetNinPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="search-marketplace"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideSearchMarketplacePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="employer-account"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideEmployerAccountPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="verify-worker"
                    element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <GuideVerifyWorkerPage />
                      </Suspense>
                    }
                  />
                </Route>
                <Route
                  path="contact"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <ContactPage />
                    </Suspense>
                  }
                />
                <Route
                  path="verify-worker"
                  element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <VerifyWorkerPage />
                    </Suspense>
                  }
                />
              </Route>

              {/* Terms Page - Story 1.5-6 AC1 */}
              <Route
                path="terms"
                element={
                  <Suspense fallback={<PageLoadingFallback />}>
                    <TermsPage />
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

            {/* ============================================
             * DASHBOARD ROUTES - Role-Based (Story 2.5-1)
             * Per AC3: Strict RBAC Route Isolation
             * Each role can ONLY access their own dashboard
             * ============================================ */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute redirectTo="/login">
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* Root dashboard redirect to role-specific home (AC2) */}
              <Route index element={<DashboardRedirect />} />

              {/* Super Admin Routes - Story 2.5-2, 2.5-3 */}
              <Route
                path="super-admin"
                element={
                  <ProtectedRoute allowedRoles={['super_admin']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <SuperAdminHome />
                    </Suspense>
                  }
                />
                <Route
                  path="questionnaires"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <QuestionnaireManagementPage />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                {/* Placeholder routes for future stories */}
                <Route path="*" element={<PlaceholderPage title="Super Admin Feature" />} />
              </Route>

              {/* Supervisor Routes - Story 2.5-4 */}
              <Route
                path="supervisor"
                element={
                  <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <SupervisorHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Supervisor Feature" />} />
              </Route>

              {/* Enumerator Routes - Story 2.5-5 */}
              <Route
                path="enumerator"
                element={
                  <ProtectedRoute allowedRoles={['enumerator']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <EnumeratorHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Enumerator Feature" />} />
              </Route>

              {/* Data Entry Clerk Routes - Story 2.5-6 */}
              <Route
                path="clerk"
                element={
                  <ProtectedRoute allowedRoles={['clerk']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ClerkHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Clerk Feature" />} />
              </Route>

              {/* Verification Assessor Routes - Story 2.5-7 */}
              <Route
                path="assessor"
                element={
                  <ProtectedRoute allowedRoles={['assessor']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <AssessorHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Assessor Feature" />} />
              </Route>

              {/* Government Official Routes - Story 2.5-7 */}
              <Route
                path="official"
                element={
                  <ProtectedRoute allowedRoles={['official']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <OfficialHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Official Feature" />} />
              </Route>

              {/* Public User Routes - Story 2.5-8 */}
              <Route
                path="public"
                element={
                  <ProtectedRoute allowedRoles={['public_user']} redirectTo="/dashboard">
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <PublicUserHome />
                    </Suspense>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <ProfilePage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<PlaceholderPage title="Public User Feature" />} />
              </Route>
            </Route>

            {/* Legacy admin route - redirect to dashboard */}
            <Route
              path="admin"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="admin/*"
              element={<Navigate to="/dashboard" replace />}
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          {/* Global Re-Authentication Modal */}
          <ReAuthModal />
        </AuthProvider>
      </BrowserRouter>
      </QueryClientProvider>

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
