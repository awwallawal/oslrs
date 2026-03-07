import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useValidateEditToken, useSubmitProfileEdit } from '../hooks/useMarketplace';

type PageState = 'loading' | 'editing' | 'submitting' | 'success' | 'expired' | 'invalid';

export default function MarketplaceEditPage() {
  const { token } = useParams<{ token: string }>();
  const { data: tokenData, isLoading } = useValidateEditToken(token || '');
  const submitMutation = useSubmitProfileEdit();

  const [bio, setBio] = useState<string>('');
  const [portfolioUrl, setPortfolioUrl] = useState<string>('');
  const [bioInitialized, setBioInitialized] = useState(false);
  const [errors, setErrors] = useState<{ bio?: string; portfolioUrl?: string }>({});

  // Initialize form fields when token validation data arrives
  useEffect(() => {
    if (tokenData?.valid && !bioInitialized) {
      setBio(tokenData.bio || '');
      setPortfolioUrl(tokenData.portfolioUrl || '');
      setBioInitialized(true);
    }
  }, [tokenData, bioInitialized]);

  const getPageState = (): PageState => {
    if (isLoading) return 'loading';
    if (submitMutation.isSuccess) return 'success';
    if (!tokenData) return 'loading';
    if (!tokenData.valid) {
      return tokenData.reason === 'expired' ? 'expired' : 'invalid';
    }
    if (submitMutation.isPending) return 'submitting';
    return 'editing';
  };

  const pageState = getPageState();

  const validate = (): boolean => {
    const newErrors: { bio?: string; portfolioUrl?: string } = {};
    if (bio.length > 150) {
      newErrors.bio = 'Bio must be 150 characters or less';
    }
    if (portfolioUrl) {
      try {
        const parsed = new URL(portfolioUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          newErrors.portfolioUrl = 'Please enter a valid URL starting with http:// or https://';
        }
      } catch {
        newErrors.portfolioUrl = 'Please enter a valid URL starting with http:// or https://';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !token) return;

    submitMutation.mutate({
      editToken: token,
      bio: bio || null,
      portfolioUrl: portfolioUrl || null,
    });
  };

  if (pageState === 'loading') {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400" data-testid="loading-spinner" />
        </div>
      </div>
    );
  }

  if (pageState === 'expired' || pageState === 'invalid') {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-6" data-testid="token-invalid">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">This link has expired or has already been used</p>
                <p className="text-sm text-amber-700 mt-1">
                  Edit links are single-use and expire after 90 days.
                </p>
                <Link
                  to="/marketplace/edit-request"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-3"
                  data-testid="request-new-token-link"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Request a new edit link
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-6" data-testid="edit-success">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-800">Your profile has been updated!</p>
                <p className="text-sm text-green-700 mt-1">
                  Your changes are now visible on the marketplace.
                </p>
                <Link
                  to="/marketplace"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-3"
                  data-testid="back-to-marketplace-link"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Marketplace
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div>
        <Link
          to="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Edit Your Profile</h1>
        <p className="text-neutral-500 mt-1">
          Update your bio and portfolio to improve your marketplace visibility.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <div className="relative">
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 150))}
                  maxLength={150}
                  rows={4}
                  placeholder="Tell employers about your skills and experience..."
                  className="w-full p-3 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  disabled={pageState === 'submitting'}
                  data-testid="bio-input"
                />
                <span
                  className={`absolute bottom-2 right-2 text-xs ${bio.length > 140 ? 'text-red-500' : 'text-neutral-400'}`}
                  data-testid="bio-counter"
                >
                  {bio.length}/150
                </span>
              </div>
              {errors.bio && (
                <p className="text-xs text-red-500" data-testid="bio-error">{errors.bio}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolioUrl">Portfolio URL</Label>
              <Input
                id="portfolioUrl"
                type="url"
                placeholder="https://your-portfolio.com"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                disabled={pageState === 'submitting'}
                data-testid="portfolio-input"
              />
              {errors.portfolioUrl && (
                <p className="text-xs text-red-500" data-testid="portfolio-error">{errors.portfolioUrl}</p>
              )}
            </div>

            {submitMutation.isError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200" data-testid="submit-error">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">
                  {submitMutation.error instanceof Error
                    ? submitMutation.error.message
                    : 'Failed to update profile. Please try again.'}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={pageState === 'submitting'}
              data-testid="save-button"
            >
              {pageState === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
