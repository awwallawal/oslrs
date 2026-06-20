import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Mail } from 'lucide-react';
import { LoginForm } from '../components/LoginForm';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { requestLoginMagicLink } from '../api/magic-link.api';

interface LoginPageProps {
  type?: 'staff' | 'public';
}

/**
 * Story 9-16 + 9-39 (AC#2) — public sign-in is magic-link-FIRST.
 *
 * The email field is the primary, always-visible action ("Enter your email and
 * we'll send you a one-time sign-in link"). It POSTs a `login`-purpose magic-link
 * request and ALWAYS shows a generic confirmation regardless of whether the email
 * matched an account (anti-enumeration — mirrors forgot-password discipline).
 * Email+password is demoted to the secondary `PasswordSignInDisclosure` below.
 */
function MagicLinkSignInEntry() {
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
      className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/40 p-4"
      data-testid="magic-link-entry-point"
    >
      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="magic-link-email" className="block text-sm font-medium text-neutral-700">
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
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {isSending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        <p className="text-xs text-neutral-500">
          We'll email you a one-time link — no password needed.
        </p>
      </form>
    </section>
  );
}

/**
 * Story 9-39 (AC#2/#3) — secondary "I already set a password" disclosure.
 *
 * Collapsed by default so the public sign-in surface leads with the magic-link.
 * Only public accounts who opted into a password (Story 9-32) need this, so the
 * password form — and the "Forgot password?" link it carries — stays OUT of the
 * default view (passwordless accounts have no password to reset). Staff are
 * unaffected: `StaffLoginPage` renders `LoginForm type="staff"` directly.
 */
function PasswordSignInDisclosure({ from }: { from: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <section data-testid="password-signin-disclosure" className="text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="password-signin-reveal"
          className="text-sm font-medium text-neutral-600 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
        >
          I already set a password
        </button>
      </section>
    );
  }

  return (
    <section data-testid="password-signin-disclosure">
      <div data-testid="password-signin-form" className="rounded-lg border border-neutral-200 bg-white p-4">
        {/* embedded: the page already supplies OSLSR branding + the /register
            cutover banner, so suppress LoginForm's own header + footer to avoid
            duplicate <h1>/heading/CTA (Story 9-39 review M1). */}
        <LoginForm type="public" redirectTo={from} embedded />
      </div>
    </section>
  );
}

/**
 * Login page component.
 *
 * Public mode (Story 9-39): magic-link-primary sign-in + a secondary password
 * disclosure, above a cutover banner pointing new visitors at the `/register`
 * wizard. Staff mode is unchanged — password + MFA via `LoginForm type="staff"`.
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
          {type === 'public' ? (
            <>
              {/* Cutover banner — primary CTA to the new wizard for NEW visitors */}
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

              {/* Branding + sign-in heading (lives on the page so it survives the
                  collapsed password disclosure) */}
              <div className="text-center">
                <h1 className="text-h1 text-primary-700 font-brand mb-1">OSLSR</h1>
                <h2 className="text-xl font-semibold text-neutral-900">Sign in</h2>
                <p className="text-neutral-600">Access your OSLSR account</p>
              </div>

              {/* Existing-user lead-in to the magic-link primary action */}
              <p
                className="text-center text-sm text-neutral-600"
                data-testid="login-page-existing-user-header"
              >
                Already registered? Enter your email below for a one-time sign-in link.
              </p>

              {/* Primary: magic-link sign-in (Story 9-16 + 9-39 AC#2) */}
              <MagicLinkSignInEntry />

              {/* Secondary: password disclosure (Story 9-39 AC#2/#3) */}
              <PasswordSignInDisclosure from={from} />
            </>
          ) : (
            <LoginForm type="staff" redirectTo={from} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
