/**
 * Campaign Watch API + TanStack Query hook.
 *
 * Wraps `GET /api/v1/admin/campaign-watch` (super-admin only).
 *
 * No polling. Radio attribution moves on the timescale of a jingle, not a heartbeat,
 * and a 30s poll on a page nobody is watching is just load — the Operations dashboard
 * polls because it watches a live box; this watches a campaign.
 */
import { useQuery } from '@tanstack/react-query';
import type { CampaignWatchSnapshot } from '@oslsr/types';
import { apiClient } from '../../../lib/api-client';

export const CAMPAIGN_WATCH_QUERY_KEY = ['campaign-watch'] as const;

export async function fetchCampaignWatch(): Promise<CampaignWatchSnapshot> {
  const result = await apiClient('/admin/campaign-watch');
  return result.data as CampaignWatchSnapshot;
}

export function useCampaignWatch() {
  return useQuery<CampaignWatchSnapshot>({
    queryKey: CAMPAIGN_WATCH_QUERY_KEY,
    queryFn: fetchCampaignWatch,
    staleTime: 60_000,
  });
}
