import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, CheckCircle, Mail } from 'lucide-react';
import { HCaptcha } from '../components/HCaptcha';
import { resendVerificationEmail, AuthApiError } from '../api/auth.api';

/**
 * Resend verification email page
 *
 * Allows users to request a new verification email if they didn't receive
 * the original or if it expired.
 */
export default function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const validateEmail = (value: string): boolean => {
    if (!value.trim()) {
      setEmailError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Invalid email format');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      return;
    }

    if (!captchaToken) {
      setApiError('Please complete the CAPTCHA verification');
      return;
    }

    setIsLoading(true);
    setApiError(null);

    try {
      await resendVerificationEmail({
        email: email.toLowerCase().trim(),
        captchaToken,
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof AuthApiError) {
        if (err.code === 'RATE_LIMIT_EXCEEDED') {
          setApiError('Too many requests. Please wait before trying again.');
        } else {
          setApiError(err.message || 'Failed to send verification email.');
        }
      } else {
        setApiError('Failed to send verification email. Please try again.');
      }
      // Reset CAPTCHA on error
      setCaptchaToken('');
      setCaptchaReset((prev) => !prev);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCaptchaVerify = (token: string) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken('');
    setCaptchaReset((prev) => !prev);
  };

  // Show success message
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-success-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-success-800 mb-2">Email Sent!</h2>
              <p className="text-neutral-600 mb-6">
                If there is an unverified account associated with <strong>{email}</strong>,
                you will receive a verification email shortly.
              </p>
              <p className="text-sm text-neutral-500 mb-6">
                Please check your inbox and spam folder. The link will expire in 24 hours.
              </p>
              <Link
                to="/login"
                className="block w-full py-3 px-4 rounded-lg font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors text-center"
              >
                Back to Login
              </Link>
            </div>
          </div>
        </main>

        <footer className="py-4 text-center text-sm text-neutral-500">
          <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-h1 text-primary-700 font-brand mb-2">OSLSR</h1>
            <h2 className="text-xl font-semibold text-neutral-900 mb-1">Resend Verification Email</h2>
            <p className="text-neutral-600">Enter your email to receive a new verification link</p>
          </div>

          {/* Info Box */}
          <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-primary-700">
                <p className="font-medium mb-1">Need a new verification link?</p>
                <p>If your previous verification link expired or you didn't receive it, enter your email below to get a new one.</p>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {apiError && (
            <div className="mb-6 p-4 bg-error-100 border border-error-600/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-error-600 font-medium">Request Failed</p>
                <p className="text-error-600/80 text-sm">{apiError}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={() => validateEmail(email)}
                disabled={isLoading}
                className={`
                  w-full px-4 py-3 rounded-lg border transition-colors
                  ${emailError
                    ? 'border-error-600 focus-visible:ring-error-600 focus:border-error-600'
                    : 'border-neutral-300 focus-visible:ring-primary-500 focus:border-primary-500'
                  }
                  disabled:bg-neutral-100 disabled:cursor-not-allowed
                  focus:outline-none focus-visible:ring-2
                `}
                placeholder="you@example.com"
              />
              {emailError && (
                <p className="text-error-600 text-sm">{emailError}</p>
              )}
            </div>

            {/* CAPTCHA */}
            <div className="py-2">
              <HCaptcha
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                reset={captchaReset}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !captchaToken}
              className={`
                w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors
                flex items-center justify-center gap-2
                ${isLoading || !captchaToken
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
                }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Verification Email'
              )}
            </button>
          </form>

          {/* Back to login */}
          <p className="mt-6 text-center text-sm text-neutral-600">
            <Link
              to="/login"
              className="text-primary-600 hover:text-primary-700 font-medium hover:underline"
            >
              Back to Login
            </Link>
          </p>
        </div>
      </main>

      <footer className="py-4 text-center text-sm text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Oyo State Labour & Skills Registry</p>
      </footer>
    </div>
  );
}
