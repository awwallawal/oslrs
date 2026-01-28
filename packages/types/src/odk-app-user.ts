import { z } from 'zod';
import { UserRole } from './constants.js';

/**
 * ODK App User types for Story 2-3
 * Per ADR-002, all ODK operations are isolated in @oslsr/odk-integration
 */

// Database record shape (matches odk_app_users table)
export interface OdkAppUserRecord {
  id: string;
  userId: string;
  odkAppUserId: number;
  displayName: string;
  encryptedToken: string;
  tokenIv: string;
  odkProjectId: number;
  createdAt: Date;
  updatedAt: Date;
}

// API response shape (WITHOUT encrypted token - never expose plaintext)
export interface OdkAppUserResponse {
  id: string;
  userId: string;
  odkAppUserId: number;
  displayName: string;
  odkProjectId: number;
  createdAt: string; // ISO 8601
}

// ODK Central API response shape (from POST /v1/projects/{projectId}/app-users)
export interface OdkAppUserApiResponse {
  id: number;
  type: 'field_key';
  displayName: string;
  token: string;
  createdAt: string; // ISO 8601
}

// Job queue payload for async provisioning
export interface CreateOdkAppUserPayload {
  userId: string;
  fullName: string;
  role: UserRole;
}

// Zod schema for job payload validation
export const createOdkAppUserPayloadSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  role: z.nativeEnum(UserRole),
});

// Type guard for field roles that need ODK App User
export const FIELD_ROLES: readonly UserRole[] = [
  UserRole.ENUMERATOR,
  UserRole.SUPERVISOR,
] as const;

export type FieldRole = typeof FIELD_ROLES[number];

/**
 * Check if a role requires ODK App User provisioning
 * Field roles: ENUMERATOR, SUPERVISOR
 * Back-office roles (NO ODK): VERIFICATION_ASSESSOR, GOVERNMENT_OFFICIAL, SUPER_ADMIN, DATA_ENTRY_CLERK, PUBLIC_USER
 */
export function isFieldRole(role: UserRole): role is FieldRole {
  return FIELD_ROLES.includes(role);
}
