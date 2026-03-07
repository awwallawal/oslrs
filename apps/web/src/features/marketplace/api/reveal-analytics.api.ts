import { apiClient } from '../../../lib/api-client';
import type { RevealStats, TopViewer, TopProfile, SuspiciousDevice } from '@oslsr/types';

export async function getRevealStats(): Promise<RevealStats> {
  const response = await apiClient('/marketplace/analytics/reveals');
  return response.data;
}

export async function getTopViewers(days: number = 7, limit: number = 10): Promise<TopViewer[]> {
  const response = await apiClient(`/marketplace/analytics/reveals/top-viewers?days=${days}&limit=${limit}`);
  return response.data;
}

export async function getTopProfiles(days: number = 7, limit: number = 10): Promise<TopProfile[]> {
  const response = await apiClient(`/marketplace/analytics/reveals/top-profiles?days=${days}&limit=${limit}`);
  return response.data;
}

export async function getSuspiciousDevices(days: number = 7, limit: number = 10): Promise<SuspiciousDevice[]> {
  const response = await apiClient(`/marketplace/analytics/reveals/suspicious-devices?days=${days}&limit=${limit}`);
  return response.data;
}
