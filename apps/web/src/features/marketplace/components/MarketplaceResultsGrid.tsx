import { Skeleton } from '../../../components/ui/skeleton';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { SearchX } from 'lucide-react';
import { WorkerCard } from './WorkerCard';
import type { MarketplaceSearchResultItem } from '@oslsr/types';

interface MarketplaceResultsGridProps {
  profiles: MarketplaceSearchResultItem[];
  isLoading: boolean;
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

export function MarketplaceResultsGrid({ profiles, isLoading }: MarketplaceResultsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="skeleton-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="empty-state">
        <SearchX className="h-12 w-12 mb-3" />
        <p className="text-lg font-medium">No workers found matching your criteria</p>
        <p className="text-sm mt-1">Try broadening your search or adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="results-grid">
      {profiles.map((profile) => (
        <WorkerCard key={profile.id} profile={profile} />
      ))}
    </div>
  );
}
