/**
 * Staff Feature Types
 * Story 2.5-3: TypeScript interfaces for Staff Management
 */

/**
 * User status enum values
 */
export type UserStatus =
  | 'invited'
  | 'pending_verification'
  | 'active'
  | 'verified'
  | 'suspended'
  | 'deactivated';

/**
 * Staff member representation for list display
 */
export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  roleId: string;
  roleName: string;
  lgaId: string | null;
  lgaName: string | null;
  createdAt: string;
  invitedAt: string | null;
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Staff list API response
 */
export interface StaffListResponse {
  data: StaffMember[];
  meta: PaginationMeta;
}

/**
 * Parameters for listing staff
 */
export interface ListStaffParams {
  page?: number;
  limit?: number;
  status?: UserStatus;
  roleId?: string;
  lgaId?: string;
  search?: string;
}

/**
 * Role representation for dropdown
 */
export interface Role {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Roles list API response
 */
export interface RolesListResponse {
  data: Role[];
}

/**
 * Update role request body
 */
export interface UpdateRoleRequest {
  roleId: string;
}

/**
 * LGA representation for dropdown
 */
export interface Lga {
  id: string;
  name: string;
  code: string;
}

/**
 * LGAs list API response
 */
export interface LgasListResponse {
  data: Lga[];
}

/**
 * Single staff response (for mutations)
 */
export interface StaffResponse {
  data: StaffMember;
}

/**
 * Resend invitation response
 */
export interface ResendInvitationResponse {
  data: {
    message: string;
    remainingResends?: number;
  };
}

/**
 * Bulk import job status
 */
export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Bulk import job response
 */
export interface ImportJobResponse {
  data: {
    jobId: string;
    status: ImportJobStatus;
    progress?: number;
    totalRows?: number;
    processedRows?: number;
    errors?: Array<{
      row: number;
      field: string;
      message: string;
    }>;
    createdCount?: number;
    skippedCount?: number;
  };
}
