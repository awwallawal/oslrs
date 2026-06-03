import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { LoginForm } from '../components/LoginForm';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { requestLoginMagicLink } from '../api/magic-link.api';

interface LoginPageProps {
  type?: 'staff' | 'public';
}

/**
 * Story 9-16 — public-only "Send me a sign-in link" entry-point. Reveals an
 * email field, POSTs a `login`-purpose magic-link request, and ALWAYS shows a
 * generic confirmation regardless of whether the email matched an account
 * (anti-enumeration — mirrors the forgot-password discipline).
 */
function MagicLinkSignInEntry() {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    try {
      await requestLoginMagicLink({ email });
    } catch {
      // Swallow — anti-enumeration: the UI must not reveal API state.
    } finally {
      setIsSending(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <section
        className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700"
        data-testid="magic-link-entry-point"
        role="status"
        aria-live="polite"
      >
        <p data-testid="magic-link-sent-message">
          If your account exists, we've sent a sign-in link to that address. Check your inbox.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-neutral-200 bg-white p-4"
      data-testid="magic-link-entry-point"
    >
      <h2 className="text-sm font-medium text-neutral-900">Or sign in with a magic link</h2>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          data-testid="magic-link-reveal-button"
          className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          Send me a sign-in link
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <label htmlFor="magic-link-email" className="block text-sm text-neutral-700">
            Email address
          </label>
          <input
            id="magic-link-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="magic-link-email-input"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-neutral-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
          <button
            type="submit"
            disabled={isSending}
            data-testid="magic-link-submit-button"
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {isSending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </section>
  );
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

          {/* Story 9-16 — public-only magic-link sign-in entry-point. */}
          {type === 'public' && <MagicLinkSignInEntry />}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
