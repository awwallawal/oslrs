import { apiClient } from '../../../lib/api-client';
import type { PublicInsightsData, PublicTrendsData } from '@oslsr/types';

const PUBLIC_BASE = '/public/insights';

export async function fetchPublicInsights(): Promise<PublicInsightsData> {
  const res = await apiClient(PUBLIC_BASE);
  return res.data;
}

export async function fetchPublicTrends(): Promise<PublicTrendsData> {
  const res = await apiClient(`${PUBLIC_BASE}/trends`);
  return res.data;
}
