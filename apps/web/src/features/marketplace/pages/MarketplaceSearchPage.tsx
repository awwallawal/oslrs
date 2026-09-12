import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { MarketplaceSearchBar } from '../components/MarketplaceSearchBar';
import { MarketplaceFilters } from '../components/MarketplaceFilters';
import { MarketplaceResultsGrid } from '../components/MarketplaceResultsGrid';
import { useMarketplaceSearch } from '../hooks/useMarketplace';
import { fetchLgas } from '../../dashboard/api/export.api';

export default function MarketplaceSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [lgaId, setLgaId] = useState(searchParams.get('lgaId') || '');
  const [profession, setProfession] = useState(searchParams.get('profession') || '');
  const [experienceLevel, setExperienceLevel] = useState(searchParams.get('experienceLevel') || '');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data: lgas = [] } = useQuery({
    queryKey: ['lgas'],
    queryFn: fetchLgas,
    staleTime: 5 * 60 * 1000,
  });

  const searchParamsObj = {
    q: query || undefined,
    lgaId: lgaId || undefined,
    profession: profession || undefined,
    experienceLevel: experienceLevel || undefined,
    cursor,
  };

  const { data, isLoading, isFetching } = useMarketplaceSearch(searchParamsObj);

  const updateUrlParams = useCallback((updates: Record<string, string>) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      params.delete('cursor');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setCursor(undefined);
    updateUrlParams({ q: value });
  }, [updateUrlParams]);

  const handleLgaChange = useCallback((value: string) => {
    setLgaId(value);
    setCursor(undefined);
    updateUrlParams({ lgaId: value });
  }, [updateUrlParams]);

  const handleProfessionChange = useCallback((value: string) => {
    setProfession(value);
    setCursor(undefined);
    updateUrlParams({ profession: value });
  }, [updateUrlParams]);

  const handleExperienceLevelChange = useCallback((value: string) => {
    setExperienceLevel(value);
    setCursor(undefined);
    updateUrlParams({ experienceLevel: value });
  }, [updateUrlParams]);

  const handleClearFilters = useCallback(() => {
    setQuery('');
    setLgaId('');
    setProfession('');
    setExperienceLevel('');
    setCursor(undefined);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const handleLoadMore = useCallback(() => {
    if (data?.meta.pagination.nextCursor) {
      setCursor(data.meta.pagination.nextCursor);
    }
  }, [data]);

  const profiles = data?.data ?? [];
  const pagination = data?.meta.pagination;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Skills Marketplace</h1>
        {/*
          ⚠️ [AI-Review][High] 2026-09-08 (Story 13-58) — this line used to read
          "Find VERIFIED skilled workers in Oyo State". R1 forbids a bare "verified"
          claim for an association import, and AC3 says NO SURFACE may make one —
          this is a surface, and it is the first thing an employer reads, sitting
          directly above the grid.

          It was defensible while every card was a self-registered worker. It stops
          being true the moment an association-vouched card appears in the grid
          below: a named body listed those people as members, nobody verified them,
          and 8,278 of them are queued behind `PIPELINE_EXCLUDED_STATUSES`. A
          page-level promise cannot be walked back by a per-card badge, and the R1
          test on `WorkerCard` is scoped to the card so it could never see this.

          The trust claim now lives ONLY on the badges, where each one names its own
          authority.
        */}
        <p className="text-muted-foreground mt-1">
          Find skilled workers in Oyo State
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <MarketplaceSearchBar value={query} onChange={handleQueryChange} />
        <MarketplaceFilters
          lgaId={lgaId}
          profession={profession}
          experienceLevel={experienceLevel}
          lgas={lgas}
          onLgaChange={handleLgaChange}
          onProfessionChange={handleProfessionChange}
          onExperienceLevelChange={handleExperienceLevelChange}
          onClear={handleClearFilters}
        />
      </div>

      {pagination && (
        <p className="text-sm text-muted-foreground mb-4" data-testid="results-count">
          {pagination.totalItems} {pagination.totalItems === 1 ? 'result' : 'results'} found
          {isFetching && !isLoading && ' (updating...)'}
        </p>
      )}

      <MarketplaceResultsGrid profiles={profiles} isLoading={isLoading} />

      {pagination?.hasNextPage && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isFetching}
            data-testid="load-more"
          >
            {isFetching ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
