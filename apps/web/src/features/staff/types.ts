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
  emailStatus?: 'pending' | 'failed' | 'not_configured';
  /**
   * Story 13-60 AC3.1 — can an ID card actually be printed for this person?
   * Derived server-side from `live_selfie_id_card_url IS NOT NULL`, the exact
   * condition the card endpoint refuses on.
   */
  hasPhoto?: boolean;
  /** Why not, when not. null = the photo step never applied (back-office). */
  photoStatus?: 'saved' | 'skipped' | 'failed' | null;
  /**
   * AC6.3 — live capture or upload, as REPORTED by the client; also set on a
   * failed attempt, where it records the path that was tried.
   */
  photoSource?: 'live_capture' | 'upload' | null;
  photoFailureReason?: string | null;
  /**
   * Story 13-59 AC7.3 — when they last took each artefact, or null if never.
   * Null is the operational signal: the offer was made and not acted on.
   */
  idCardDownloadedAt?: string | null;
  briefingDownloadedAt?: string | null;
  /**
   * Story 13-59 (review H3) — the server's VERDICT on what this person still
   * owes, rather than the ingredients for the browser to re-derive one. The
   * table used to hold its own copy of the role rules; sending the answer
   * removes the second opinion instead of trying to keep two in step.
   */
  artefactsOutstanding?: Array<'id_card' | 'briefing'>;
  /** False for back-office roles, who are entitled to neither artefact. */
  artefactsApplicable?: boolean;
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
  /** Story 13-60 AC3.1 — narrow to staff who cannot be issued an ID card. */
  missingPhoto?: boolean;
  /** Story 13-59 AC7.3 — narrow to staff who have not taken their artefacts. */
  missingArtefacts?: boolean;
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
