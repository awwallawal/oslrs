import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, ExternalLink, LogIn, Lock } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { GovernmentVerifiedBadge } from '../components/GovernmentVerifiedBadge';
import { MarketplaceProfileSkeleton } from '../components/MarketplaceProfileSkeleton';
import { useMarketplaceProfile } from '../hooks/useMarketplace';
import { useAuth } from '../../auth/context/AuthContext';

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

export default function MarketplaceProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: profile, isLoading, error } = useMarketplaceProfile(id || '');

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
      <Card>
        <CardContent className="pt-6 space-y-3">
          {isAuthenticated ? (
            <Button
              className="w-full"
              disabled
              data-testid="reveal-contact-authenticated"
            >
              <Lock className="w-4 h-4 mr-2" />
              Reveal Contact Details
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => navigate('/login', { state: { from: `/marketplace/profile/${id}` } })}
              data-testid="reveal-contact-unauthenticated"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign in to Reveal Contact
            </Button>
          )}
          {isAuthenticated && (
            <p className="text-xs text-neutral-400 text-center">Contact reveal coming soon</p>
          )}
          <p className="text-xs text-neutral-500 text-center">
            Contact details are only available to registered employers who have verified their identity.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
