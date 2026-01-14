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
 */
export function HCaptcha({
  onVerify,
  onExpire,
  onError,
  error,
  reset,
}: HCaptchaProps) {
  const captchaRef = useRef<HCaptchaComponent>(null);

  // Reset captcha when reset prop changes
  useEffect(() => {
    if (reset && captchaRef.current) {
      captchaRef.current.resetCaptcha();
    }
  }, [reset]);

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
