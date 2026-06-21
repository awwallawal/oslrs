import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, LogIn, Lock, Loader2, AlertCircle, Pencil, ShieldCheck, Send, FileText } from 'lucide-react';
import { useDeviceFingerprint } from '../../../hooks/useDeviceFingerprint';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { GovernmentVerifiedBadge } from '../components/GovernmentVerifiedBadge';
import { MarketplaceProfileSkeleton } from '../components/MarketplaceProfileSkeleton';
import { useMarketplaceProfile, useRevealContact, useRequestRevealStepUp, useVerifyRevealStepUp, marketplaceKeys } from '../hooks/useMarketplace';
import { useAuth } from '../../auth/context/AuthContext';
import { HCaptcha } from '../../auth/components/HCaptcha';
import { ApiError } from '../../../lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type { ContactRevealResponse } from '@oslsr/types';

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-neutral-100 last:border-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-neutral-900">{value || '\u2014'}</span>
    </div>
  );
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
  });
}

type RevealState = 'idle' | 'captcha' | 'loading' | 'revealed' | 'error' | 'step_up' | 'purpose';

const PURPOSE_MAX = 280;

export default function MarketplaceProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const deviceFingerprint = useDeviceFingerprint();
  const { data: profile, isLoading, error } = useMarketplaceProfile(id || '');
  const queryClient = useQueryClient();
  const revealMutation = useRevealContact();
  const requestStepUp = useRequestRevealStepUp();
  const verifyStepUp = useVerifyRevealStepUp();

  // Check for cached reveal result (persists across navigation within session)
  const cachedReveal = id
    ? queryClient.getQueryData<ContactRevealResponse>(marketplaceKeys.revealedContact(id))
    : null;

  const [revealState, setRevealState] = useState<RevealState>(cachedReveal ? 'revealed' : 'idle');
  const [revealedContact, setRevealedContact] = useState<ContactRevealResponse | null>(cachedReveal ?? null);
  const [revealError, setRevealError] = useState<string>('');
  const [captchaReset, setCaptchaReset] = useState(false);

  // Story 9-41 AC#4/#5 — step-up gating state.
  const [requiredLevel, setRequiredLevel] = useState<'otp' | 'mfa'>('otp');
  const [otpRequested, setOtpRequested] = useState(false);
  const [stepUpCode, setStepUpCode] = useState('');
  const [stepUpError, setStepUpError] = useState('');

  // Story 9-41 AC#6 — purpose-binding state. Once provided it is latched and
  // reused on every subsequent reveal this session (so the viewer isn't asked
  // to re-state their purpose on each high-volume reveal).
  const [purposeText, setPurposeText] = useState('');
  const [tosChecked, setTosChecked] = useState(false);
  const [purposeProvided, setPurposeProvided] = useState(false);

  const handleRevealClick = () => {
    setRevealError('');
    setRevealState('captcha');
  };

  const handleCaptchaVerify = (token: string) => {
    if (!token || !id) return;
    setRevealState('loading');
    // Attach purpose/ToS only once the viewer has supplied them (above-threshold
    // retry) — below the threshold the reveal stays frictionless.
    const accountability = purposeProvided
      ? { purpose: purposeText.trim(), tosAccepted: true }
      : undefined;
    revealMutation.mutate(
      { profileId: id, captchaToken: token, deviceFingerprint, ...(accountability ? { accountability } : {}) },
      {
        onSuccess: (data) => {
          setRevealedContact(data);
          setRevealState('revealed');
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            // AC#5/#4 — progressive friction / breaker: drive the step-up rung UI.
            if (err.code === 'REVEAL_STEP_UP_REQUIRED') {
              const lvl = (err.details as { requiredLevel?: 'otp' | 'mfa' } | undefined)?.requiredLevel;
              setRequiredLevel(lvl === 'mfa' ? 'mfa' : 'otp');
              setOtpRequested(false);
              setStepUpCode('');
              setStepUpError('');
              setRevealState('step_up');
              return;
            }
            // AC#6 — above the volume threshold a purpose declaration is required.
            if (err.code === 'REVEAL_PURPOSE_REQUIRED') {
              setRevealState('purpose');
              return;
            }
            // AC#2 — this candidate has been revealed to too many people recently.
            if (err.code === 'REVEAL_PROFILE_CAP_REACHED') {
              setRevealError('This contact has been revealed to too many people recently. Please try again later.');
            } else if (err.status === 404) {
              setRevealError('This worker has not opted in to share contact details.');
            } else if (err.status === 429) {
              setRevealError("You've reached the daily limit of 50 contact reveals. Please try again tomorrow.");
            } else {
              setRevealError(err.message || 'Failed to reveal contact details. Please try again.');
            }
          } else {
            setRevealError('A network error occurred. Please try again.');
          }
          setRevealState('error');
          setCaptchaReset((prev) => !prev);
        },
      },
    );
  };

  const handleCaptchaExpire = () => {
    setRevealState('idle');
  };

  const handleCaptchaError = () => {
    setRevealError('Verification failed. Please try again.');
    setRevealState('error');
    setCaptchaReset((prev) => !prev);
  };

  // AC#5 — send the one-time code to the viewer's registered phone.
  const handleSendOtp = () => {
    setStepUpError('');
    requestStepUp.mutate(undefined, {
      onSuccess: () => setOtpRequested(true),
      onError: (err) => {
        setStepUpError(err instanceof ApiError ? err.message : 'Could not send a code. Please try again.');
      },
    });
  };

  // AC#5 — verify the OTP/MFA code, then retry the reveal behind a fresh CAPTCHA
  // (the previous token was consumed by the gated attempt).
  const handleVerifyStepUp = () => {
    if (!stepUpCode.trim()) return;
    setStepUpError('');
    verifyStepUp.mutate(
      { method: requiredLevel, code: stepUpCode.trim() },
      {
        onSuccess: () => {
          setStepUpCode('');
          setRevealError('');
          setRevealState('captcha');
        },
        onError: (err) => {
          setStepUpError(err instanceof ApiError ? err.message : 'Verification failed. Please try again.');
        },
      },
    );
  };

  // AC#6 — latch the purpose + ToS, then retry the reveal behind a fresh CAPTCHA.
  const handlePurposeContinue = () => {
    if (!purposeText.trim() || !tosChecked) return;
    setPurposeProvided(true);
    setRevealError('');
    setRevealState('captcha');
  };

  if (isLoading) {
    return <MarketplaceProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center space-y-4" data-testid="profile-not-found">
        <h1 className="text-2xl font-bold text-neutral-900">Profile not found</h1>
        <p className="text-neutral-500">This profile may have been removed or the link is incorrect.</p>
        <Link to="/marketplace" className="inline-flex items-center gap-2 text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/marketplace')}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Search
        </Button>
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-neutral-900">{profile.profession || 'Unknown Profession'}</h1>
          {profile.verifiedBadge && <GovernmentVerifiedBadge />}
        </div>
      </div>

      {/* Profile Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow
            label="Location"
            value={profile.lgaName}
          />
          <InfoRow
            label="Experience Level"
            value={profile.experienceLevel}
          />
          <div className="flex justify-between py-2 border-b border-neutral-100 last:border-0">
            <span className="text-sm text-neutral-500">Member Since</span>
            <span className="text-sm font-medium text-neutral-900 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(profile.createdAt)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* About Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-700 whitespace-pre-line" data-testid="profile-bio">
            {profile.bio || "This worker hasn't added a bio yet."}
          </p>
          {profile.portfolioUrl && /^https?:\/\//i.test(profile.portfolioUrl) ? (
            <a
              href={profile.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              data-testid="portfolio-link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Portfolio
            </a>
          ) : (
            <p className="text-sm text-neutral-400 italic" data-testid="no-portfolio">
              No portfolio link provided.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Contact Section */}
      {revealState === 'revealed' && revealedContact ? (
        <Card className="border-green-200 bg-green-50" data-testid="contact-revealed">
          <CardHeader>
            <CardTitle className="text-green-800 text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Contact Details Revealed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow
              label="Name"
              value={
                revealedContact.firstName || revealedContact.lastName
                  ? `${revealedContact.firstName ?? ''} ${revealedContact.lastName ?? ''}`.trim()
                  : 'Not provided'
              }
            />
            <InfoRow label="Phone" value={revealedContact.phoneNumber ?? 'Not provided'} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {!isAuthenticated ? (
              <Button
                className="w-full"
                onClick={() => navigate('/login', { state: { from: `/marketplace/profile/${id}` } })}
                data-testid="reveal-contact-unauthenticated"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign in to Reveal Contact
              </Button>
            ) : revealState === 'step_up' ? (
              <div className="space-y-3" data-testid="reveal-step-up">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Extra verification needed</p>
                    <p className="text-sm text-neutral-600">
                      {requiredLevel === 'otp'
                        ? "You've revealed several contacts recently. To keep the registry safe, confirm it's you with a one-time code sent to your registered phone."
                        : 'Enter the 6-digit code from your authenticator app to continue.'}
                    </p>
                  </div>
                </div>

                {requiredLevel === 'otp' && !otpRequested ? (
                  <Button
                    className="w-full"
                    onClick={handleSendOtp}
                    disabled={requestStepUp.isPending}
                    data-testid="step-up-send-otp"
                  >
                    {requestStepUp.isPending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                      : <><Send className="w-4 h-4 mr-2" /> Send code to my phone</>}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={stepUpCode}
                      onChange={(e) => setStepUpCode(e.target.value.replace(/\s/g, ''))}
                      placeholder={requiredLevel === 'otp' ? 'Enter the code from your SMS' : 'Authenticator code'}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="step-up-code-input"
                    />
                    <Button
                      className="w-full"
                      onClick={handleVerifyStepUp}
                      disabled={verifyStepUp.isPending || !stepUpCode.trim()}
                      data-testid="step-up-verify"
                    >
                      {verifyStepUp.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
                        : <><ShieldCheck className="w-4 h-4 mr-2" /> Verify &amp; continue</>}
                    </Button>
                    {requiredLevel === 'otp' && (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={requestStepUp.isPending}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                        data-testid="step-up-resend-otp"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                )}

                {stepUpError && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200" data-testid="step-up-error">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{stepUpError}</p>
                  </div>
                )}
              </div>
            ) : revealState === 'purpose' ? (
              <div className="space-y-3" data-testid="reveal-purpose">
                <div className="flex items-start gap-2">
                  <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Tell us why you need this contact</p>
                    <p className="text-sm text-neutral-600">
                      Because you&apos;re revealing a high number of contacts, please briefly state your purpose. This is recorded with your reveal.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <textarea
                    value={purposeText}
                    onChange={(e) => setPurposeText(e.target.value.slice(0, PURPOSE_MAX))}
                    maxLength={PURPOSE_MAX}
                    rows={3}
                    placeholder="e.g. Hiring an electrician for a residential project in Ibadan."
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid="purpose-input"
                  />
                  <p className="text-xs text-neutral-400 text-right">{purposeText.length}/{PURPOSE_MAX}</p>
                </div>

                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={tosChecked}
                    onChange={(e) => setTosChecked(e.target.checked)}
                    className="mt-0.5"
                    data-testid="purpose-tos"
                  />
                  <span>
                    I will only use this contact for legitimate hiring or engagement, and I agree to the acceptable-use terms.
                  </span>
                </label>

                <Button
                  className="w-full"
                  onClick={handlePurposeContinue}
                  disabled={!purposeText.trim() || !tosChecked}
                  data-testid="purpose-continue"
                >
                  Continue
                </Button>
              </div>
            ) : revealState === 'loading' ? (
              <Button className="w-full" disabled data-testid="reveal-contact-loading">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Revealing...
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={handleRevealClick}
                data-testid="reveal-contact-authenticated"
              >
                <Lock className="w-4 h-4 mr-2" />
                Reveal Contact Details
              </Button>
            )}

            {revealState === 'captcha' && (
              <div className="mt-4" data-testid="captcha-widget">
                <p className="text-sm text-neutral-600 mb-2">
                  Please complete the verification to view contact details.
                </p>
                <HCaptcha
                  onVerify={handleCaptchaVerify}
                  onExpire={handleCaptchaExpire}
                  onError={handleCaptchaError}
                  reset={captchaReset}
                />
              </div>
            )}

            {(revealState === 'error' || revealError) && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200" data-testid="reveal-error">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{revealError}</p>
              </div>
            )}

            <p className="text-xs text-neutral-500 text-center">
              Contact details are only available to registered users who have verified their identity.
            </p>
          </CardContent>
        </Card>
      )}

      {/* "Is this your profile?" link — navigates to edit request */}
      <div className="text-center" data-testid="edit-profile-prompt">
        <Link
          to="/marketplace/edit-request"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600"
        >
          <Pencil className="w-3.5 h-3.5" />
          Is this your profile? Edit it here.
        </Link>
      </div>
    </div>
  );
}
