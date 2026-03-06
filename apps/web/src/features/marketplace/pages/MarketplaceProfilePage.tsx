import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, LogIn, Lock, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { GovernmentVerifiedBadge } from '../components/GovernmentVerifiedBadge';
import { MarketplaceProfileSkeleton } from '../components/MarketplaceProfileSkeleton';
import { useMarketplaceProfile, useRevealContact, marketplaceKeys } from '../hooks/useMarketplace';
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

type RevealState = 'idle' | 'captcha' | 'loading' | 'revealed' | 'error';

export default function MarketplaceProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: profile, isLoading, error } = useMarketplaceProfile(id || '');
  const queryClient = useQueryClient();
  const revealMutation = useRevealContact();

  // Check for cached reveal result (persists across navigation within session)
  const cachedReveal = id
    ? queryClient.getQueryData<ContactRevealResponse>(marketplaceKeys.revealedContact(id))
    : null;

  const [revealState, setRevealState] = useState<RevealState>(cachedReveal ? 'revealed' : 'idle');
  const [revealedContact, setRevealedContact] = useState<ContactRevealResponse | null>(cachedReveal ?? null);
  const [revealError, setRevealError] = useState<string>('');
  const [captchaReset, setCaptchaReset] = useState(false);

  const handleRevealClick = () => {
    setRevealError('');
    setRevealState('captcha');
  };

  const handleCaptchaVerify = (token: string) => {
    if (!token || !id) return;
    setRevealState('loading');
    revealMutation.mutate(
      { profileId: id, captchaToken: token },
      {
        onSuccess: (data) => {
          setRevealedContact(data);
          setRevealState('revealed');
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status === 404) {
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
    </div>
  );
}
