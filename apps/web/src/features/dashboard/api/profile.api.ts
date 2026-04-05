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
