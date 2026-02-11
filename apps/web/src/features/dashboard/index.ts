/**
 * Dashboard Feature Module
 *
 * Exports components and configuration for role-based dashboards.
 * Story 2.5-1: Dashboard Layout Architecture & Role-Based Routing
 */

// Components
export { DashboardRedirect } from './components/DashboardRedirect';

// Configuration
export {
  sidebarConfig,
  roleRouteMap,
  ROLE_DISPLAY_NAMES,
  getSidebarItems,
  getDashboardRoute,
  getRoleDisplayName,
  ALL_ROLES,
} from './config/sidebarConfig';

export type { UserRole } from '@oslsr/types';
export type { NavItem } from './config/sidebarConfig';
