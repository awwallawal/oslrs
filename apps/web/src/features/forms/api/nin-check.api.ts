import { apiClient } from '../../../lib/api-client';

export interface NinCheckResponse {
  available: boolean;
  reason?: 'respondent' | 'staff';
  registeredAt?: string;
}

export async function checkNinAvailability(nin: string): Promise<NinCheckResponse> {
  const result = await apiClient('/forms/check-nin', {
    method: 'POST',
    body: JSON.stringify({ nin }),
  });
  return result.data;
}
