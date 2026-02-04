/**
 * Staff Feature Module
 * Story 2.5-3: Super Admin Staff Management
 */

// Types
export type {
  StaffMember,
  UserStatus,
  PaginationMeta,
  StaffListResponse,
  ListStaffParams,
  Role,
  RolesListResponse,
  UpdateRoleRequest,
  StaffResponse,
  ResendInvitationResponse,
  ImportJobStatus,
  ImportJobResponse,
} from './types';

// API functions
export {
  listStaff,
  updateStaffRole,
  deactivateStaff,
  resendInvitation,
  downloadStaffIdCard,
  listRoles,
  createStaffManual,
  importStaffCsv,
  getImportStatus,
} from './api/staff.api';

// Hooks
export {
  staffKeys,
  rolesKeys,
  useStaffList,
  useRoles,
  useUpdateRole,
  useDeactivateStaff,
  useResendInvitation,
  useDownloadIdCard,
  useCreateStaffManual,
  useImportStaffCsv,
  useImportStatus,
} from './hooks/useStaff';

// Components
export {
  StaffTable,
  StaffStatusBadge,
  StaffActionsMenu,
  RoleChangeDialog,
  DeactivateDialog,
  BulkImportModal,
} from './components';

// Pages
export { default as StaffManagementPage } from './pages/StaffManagementPage';
