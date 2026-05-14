import { Link, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { LoginForm } from '../components/LoginForm';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface LoginPageProps {
  type?: 'staff' | 'public';
}

/**
 * Login page component
 *
 * Displays the login form with proper branding and layout.
 * Handles redirect after successful login.
 *
 * Story 9-12 Task 8 — public login mode now carries the migration cutover
 * banner above the form. New respondents are routed to the 5-step wizard at
 * `/register`; existing public_users keep using their password here. Staff
 * login is unchanged (no banner).
 */
export default function LoginPage({ type = 'public' }: LoginPageProps) {
  useDocumentTitle(type === 'staff' ? 'Staff Login' : 'Login');
  const location = useLocation();

  // Get redirect destination from state (set by ProtectedRoute)
  const state = location.state as { from?: string } | null;
  const from = state?.from || '/dashboard';

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          {type === 'public' && (
            <>
              {/* AC#11 cutover banner — primary CTA to the new wizard */}
              <aside
                className="rounded-lg border border-info-200 bg-info-50 p-4 text-sm text-info-800"
                aria-label="New respondent? Try the registration wizard"
                data-testid="login-page-cutover-banner"
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-info-600" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="font-medium text-info-900">New here?</p>
                    <p className="mt-1">
                      Try our new registration wizard. It takes about 5 minutes.
                    </p>
                    <Link
                      to="/register"
                      className="mt-2 inline-flex items-center text-primary-700 font-medium hover:text-primary-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
                      data-testid="login-page-cutover-link"
                    >
                      Start registration →
                    </Link>
                  </div>
                </div>
              </aside>

              {/* Existing-user header — visually distinct from the cutover banner */}
              <p
                className="text-center text-sm text-neutral-600"
                data-testid="login-page-existing-user-header"
              >
                Already registered? Sign in below.
              </p>
            </>
          )}

          <LoginForm type={type} redirectTo={from} />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
