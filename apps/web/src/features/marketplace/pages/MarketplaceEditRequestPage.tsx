import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { HCaptcha } from '../../auth/components/HCaptcha';
import { requestEditToken } from '../api/marketplace.api';
import { ApiError } from '../../../lib/api-client';

type PageState = 'form' | 'captcha' | 'loading' | 'success' | 'error';

export default function MarketplaceEditRequestPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pageState, setPageState] = useState<PageState>('form');
  const [errorMessage, setErrorMessage] = useState('');
  const [captchaReset, setCaptchaReset] = useState(false);

  const isPhoneValid = phoneNumber.replace(/\s/g, '').length >= 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) return;
    setErrorMessage('');
    setPageState('captcha');
  };

  const handleCaptchaVerify = async (captchaToken: string) => {
    if (!captchaToken) return;
    setPageState('loading');

    try {
      await requestEditToken(phoneNumber.replace(/\s/g, ''), captchaToken);
      setPageState('success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErrorMessage('Too many requests. Please try again later.');
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
      setPageState('error');
      setCaptchaReset((prev) => !prev);
    }
  };

  const handleCaptchaExpire = () => {
    setPageState('form');
  };

  const handleCaptchaError = () => {
    setErrorMessage('Verification failed. Please try again.');
    setPageState('error');
    setCaptchaReset((prev) => !prev);
  };

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div>
        <Link
          to="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-4"
          data-testid="back-link"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Edit Your Marketplace Profile</h1>
        <p className="text-neutral-500 mt-1">
          Enter the phone number used during registration. We&apos;ll send you a one-time edit link via SMS.
        </p>
      </div>

      {pageState === 'success' ? (
        <Card className="border-green-200 bg-green-50" data-testid="success-message">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-800">Check your phone</p>
                <p className="text-sm text-green-700 mt-1">
                  If a marketplace profile exists for this phone number, you&apos;ll receive an SMS with an edit link shortly.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Edit Link</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+234 or 0..."
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={pageState === 'loading'}
                  data-testid="phone-input"
                />
                <p className="text-xs text-neutral-400">Nigerian phone format: +234... or 0...</p>
              </div>

              {pageState === 'captcha' && (
                <div data-testid="captcha-widget">
                  <p className="text-sm text-neutral-600 mb-2">
                    Please complete the verification to continue.
                  </p>
                  <HCaptcha
                    onVerify={handleCaptchaVerify}
                    onExpire={handleCaptchaExpire}
                    onError={handleCaptchaError}
                    reset={captchaReset}
                  />
                </div>
              )}

              {(pageState === 'error' || errorMessage) && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200" data-testid="error-message">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}

              {pageState !== 'captcha' && (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!isPhoneValid || pageState === 'loading'}
                  data-testid="submit-button"
                >
                  {pageState === 'loading' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Edit Link
                    </>
                  )}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
