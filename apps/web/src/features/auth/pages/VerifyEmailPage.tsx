import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, MailOpen } from 'lucide-react';
import { verifyEmail, AuthApiError } from '../api/auth.api';

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired';

/**
 * Email verification page
 *
 * Handles email verification when user clicks the link from their email.
 */
export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const verify = async () => {
      if (!token || token.length !== 64) {
        setStatus('error');
        setErrorMessage('Invalid verification link.');
        return;
      }

      try {
        await verifyEmail(token);
        setStatus('success');
      } catch (err) {
        if (err instanceof AuthApiError) {
          if (err.code === 'VERIFICATION_TOKEN_EXPIRED') {
            setStatus('expired');
            setErrorMessage('This verification link has expired.');
          } else if (err.code === 'VERIFICATION_TOKEN_INVALID') {
            setStatus('error');
            setErrorMessage('This verification link is invalid or has already been used.');
          } else {
            setStatus('error');
            setErrorMessage(err.message || 'Verification failed.');
          }
        } else {
          setStatus('error');
          setErrorMessage('An error occurred. Please try again.');
        }
      }
    };

    verify();
  }, [token]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Verifying your email...</h2>
            <p className="text-neutral-600">Please wait while we verify your email address.</p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-success-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-success-800 mb-2">Email Verified!</h2>
            <p className="text-neutral-600 mb-6">
              Your email has been successfully verified. You can now log in to your account.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        );

      case 'expired':
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center">
                <MailOpen className="w-8 h-8 text-warning-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-warning-800 mb-2">Link Expired</h2>
            <p className="text-neutral-600 mb-6">{errorMessage}</p>
            <div className="space-y-3">
              <Link
                to="/resend-verification"
                className="block w-full py-3 px-4 rounded-lg font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors text-center"
              >
                Request New Verification Link
              </Link>
              <Link
                to="/login"
                className="block text-center text-sm text-primary-600 hover:text-primary-700 hover:underline"
              >
                Back to Login
              </Link>
            </div>
          </div>
        );

      case 'error':
      default:
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-error-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-error-800 mb-2">Verification Failed</h2>
            <p className="text-neutral-600 mb-6">{errorMessage}</p>
            <div className="space-y-3">
              <Link
                to="/resend-verification"
                className="block w-full py-3 px-4 rounded-lg font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors text-center"
              >
                Request New Verification Link
              </Link>
              <Link
                to="/login"
                className="block text-center text-sm text-primary-600 hover:text-primary-700 hover:underline"
              >
                Back to Login
              </Link>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
          </div>

          {/* Status Card */}
          <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200">
            {renderContent()}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
