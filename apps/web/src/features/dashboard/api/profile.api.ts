import { apiClient } from '../../../lib/api-client';
import type { UpdateProfilePayload } from '@oslsr/types';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  lgaId: string | null;
  lgaName: string | null;
  roleName: string;
  homeAddress: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  liveSelfieOriginalUrl: string | null;
  /**
   * Story 13-60 AC2.2 — null means NO ID CARD CAN BE PRINTED. This is the exact
   * column `user.controller.ts` refuses card generation on, which is why the
   * banner keys on it rather than on `liveSelfieOriginalUrl` or `photoStatus`.
   */
  liveSelfieIdCardUrl: string | null;
  /** Why there is no photo. null = the step never applied (back-office), or the account predates 13-60. */
  photoStatus: 'saved' | 'skipped' | 'failed' | null;
  photoFailureReason: string | null;
  createdAt: string;
}

export async function fetchProfile(): Promise<UserProfile> {
  const response = await apiClient('/users/profile');
  return response.data;
}

export interface UpdateProfileResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  homeAddress: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  status: string;
}

export async function updateProfile(data: UpdateProfilePayload): Promise<UpdateProfileResponse> {
  const response = await apiClient('/users/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.data;
}
