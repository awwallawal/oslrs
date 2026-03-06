import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { CheckCircle, MapPin, Briefcase } from 'lucide-react';
import type { MarketplaceSearchResultItem } from '@oslsr/types';

interface WorkerCardProps {
  profile: MarketplaceSearchResultItem;
}

export function WorkerCard({ profile }: WorkerCardProps) {
  const truncatedBio = profile.bio
    ? profile.bio.length > 100 ? `${profile.bio.slice(0, 100)}...` : profile.bio
    : null;

  return (
    <Card data-testid="worker-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold">
            {profile.profession || 'Unknown Profession'}
          </CardTitle>
          {profile.verifiedBadge && (
            <Badge variant="secondary" className="shrink-0 bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {profile.lgaName && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {profile.lgaName}
          </div>
        )}
        {profile.experienceLevel && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            {profile.experienceLevel}
          </div>
        )}
        {truncatedBio && (
          <p className="text-sm text-muted-foreground line-clamp-3">{truncatedBio}</p>
        )}
        <Button variant="outline" size="sm" className="w-full mt-2" disabled>
          View Profile
        </Button>
      </CardContent>
    </Card>
  );
}
