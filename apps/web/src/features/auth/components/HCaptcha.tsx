import { useRef, useEffect } from 'react';
import HCaptchaComponent from '@hcaptcha/react-hcaptcha';

// hCaptcha site key from environment
const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY || '10000000-ffff-ffff-ffff-000000000001';

interface HCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: string) => void;
  error?: string;
  reset?: boolean;
}

/**
 * HCaptcha wrapper component with error display
 *
 * Uses test site key in development for easier testing.
 * Production key should be set via VITE_HCAPTCHA_SITE_KEY.
 *
 * When VITE_E2E=true, auto-bypasses the widget for headless CI.
 */
export function HCaptcha({
  onVerify,
  onExpire,
  onError,
  error,
  reset,
}: HCaptchaProps) {
  const isE2E = import.meta.env.VITE_E2E === 'true';
  const captchaRef = useRef<HCaptchaComponent>(null);

  // E2E bypass: auto-verify on mount so headless CI never loads the iframe
  useEffect(() => {
    if (isE2E) {
      onVerify('test-captcha-bypass');
    }
  }, [isE2E]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset captcha when reset prop changes
  useEffect(() => {
    if (!isE2E && reset && captchaRef.current) {
      captchaRef.current.resetCaptcha();
    }
  }, [isE2E, reset]);

  if (isE2E) return null;

  const handleVerify = (token: string) => {
    onVerify(token);
  };

  const handleExpire = () => {
    onVerify(''); // Clear the token
    onExpire?.();
  };

  const handleError = (event: string) => {
    onVerify(''); // Clear the token
    onError?.(event);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <HCaptchaComponent
          ref={captchaRef}
          sitekey={HCAPTCHA_SITE_KEY}
          onVerify={handleVerify}
          onExpire={handleExpire}
          onError={handleError}
        />
      </div>
      {error && (
        <p className="text-error-600 text-sm text-center">{error}</p>
      )}
    </div>
  );
}
