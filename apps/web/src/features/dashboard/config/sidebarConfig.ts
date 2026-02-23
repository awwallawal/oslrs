/**
 * Sidebar Navigation Configuration
 *
 * Per-role sidebar navigation items for the DashboardLayout.
 * Each role has a specific set of nav items with icons from lucide-react.
 *
 * Story 2.5-1 AC5: Dynamic Sidebar Items
 * - Enumerator/Public User: 3-4 items (mobile-first)
 * - Supervisor: 4 items (Story 2.5-4 AC3)
 * - Super Admin: 12+ items
 */

import type { LucideIcon } from 'lucide-react';
import {
  Home,
  FileText,
  Save,
  RefreshCw,
  ClipboardList,
  Briefcase,
  HelpCircle,
  ListOrdered,
  CheckSquare,
  BarChart,
  Users,
  AlertTriangle,
  MessageSquare,
  FileSearch,
  CheckCircle,
  Shield,
  PieChart,
  TrendingUp,
  Download,
  Settings,
  Activity,
  Database,
  ScrollText,
  UserCog,
  SlidersHorizontal,
} from 'lucide-react';
import { type UserRole, ROLE_DISPLAY_NAMES, ALL_ROLES as SHARED_ALL_ROLES, getRoleDisplayName } from '@oslsr/types';

/**
 * Navigation item configuration
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

/**
 * Role to dashboard route mapping
 */
export const roleRouteMap: Record<UserRole, string> = {
  super_admin: '/dashboard/super-admin',
  supervisor: '/dashboard/supervisor',
  enumerator: '/dashboard/enumerator',
  data_entry_clerk: '/dashboard/clerk',
  verification_assessor: '/dashboard/assessor',
  government_official: '/dashboard/official',
  public_user: '/dashboard/public',
};

/**
 * Role display names — re-exported from shared constants
 */
export { ROLE_DISPLAY_NAMES };

/**
 * Sidebar configuration by role
 *
 * AC5 Requirements:
 * - Enumerator: Home, Surveys, Drafts, Sync Status
 * - Public User: Home, Survey Status, Marketplace, Support
 * - Clerk: Home, Entry Queue, Completed, My Stats
 * - Supervisor: Home, Team Progress, Fraud Alerts, Messages (4 items, Story 2.5-4 AC3)
 * - Assessor: Home, Audit Queue, Completed, Evidence
 * - Official: Home, Statistics, Trends, Export
 * - Super Admin: 12+ items
 */
export const sidebarConfig: Record<UserRole, NavItem[]> = {
  enumerator: [
    { label: 'Home', href: '/dashboard/enumerator', icon: Home },
    { label: 'Surveys', href: '/dashboard/enumerator/survey', icon: FileText },
    { label: 'Drafts', href: '/dashboard/enumerator/drafts', icon: Save },
    { label: 'Sync Status', href: '/dashboard/enumerator/sync', icon: RefreshCw },
    { label: 'Messages', href: '/dashboard/enumerator/messages', icon: MessageSquare },
  ],

  public_user: [
    { label: 'Home', href: '/dashboard/public', icon: Home },
    { label: 'Survey Status', href: '/dashboard/public/surveys', icon: ClipboardList },
    { label: 'Marketplace', href: '/dashboard/public/marketplace', icon: Briefcase },
    { label: 'Support', href: '/dashboard/public/support', icon: HelpCircle },
  ],

  data_entry_clerk: [
    { label: 'Home', href: '/dashboard/clerk', icon: Home },
    { label: 'Entry Queue', href: '/dashboard/clerk/surveys', icon: ListOrdered },
    { label: 'Completed', href: '/dashboard/clerk/completed', icon: CheckSquare },
    { label: 'My Stats', href: '/dashboard/clerk/stats', icon: BarChart },
  ],

  supervisor: [
    { label: 'Home', href: '/dashboard/supervisor', icon: Home },
    { label: 'Team Progress', href: '/dashboard/supervisor/team', icon: Users },
    { label: 'Fraud Alerts', href: '/dashboard/supervisor/fraud', icon: AlertTriangle },
    { label: 'Messages', href: '/dashboard/supervisor/messages', icon: MessageSquare },
  ],

  verification_assessor: [
    { label: 'Home', href: '/dashboard/assessor', icon: Home },
    { label: 'Audit Queue', href: '/dashboard/assessor/queue', icon: FileSearch },
    { label: 'Completed', href: '/dashboard/assessor/completed', icon: CheckCircle },
    { label: 'Evidence', href: '/dashboard/assessor/evidence', icon: Shield },
    { label: 'Export Data', href: '/dashboard/assessor/export', icon: Download },
  ],

  government_official: [
    { label: 'Home', href: '/dashboard/official', icon: Home },
    { label: 'Statistics', href: '/dashboard/official/stats', icon: PieChart },
    { label: 'Trends', href: '/dashboard/official/trends', icon: TrendingUp },
    { label: 'Export', href: '/dashboard/official/export', icon: Download },
  ],

  super_admin: [
    { label: 'Home', href: '/dashboard/super-admin', icon: Home },
    { label: 'Staff Management', href: '/dashboard/super-admin/staff', icon: Users },
    { label: 'Questionnaires', href: '/dashboard/super-admin/questionnaires', icon: FileText },
    { label: 'Fraud Review', href: '/dashboard/super-admin/fraud', icon: AlertTriangle },
    { label: 'Audit Queue', href: '/dashboard/super-admin/audit', icon: FileSearch },
    { label: 'Data Overview', href: '/dashboard/super-admin/data', icon: Database },
    { label: 'Reports', href: '/dashboard/super-admin/reports', icon: BarChart },
    { label: 'Export Data', href: '/dashboard/super-admin/export', icon: Download },
    { label: 'Audit Logs', href: '/dashboard/super-admin/logs', icon: ScrollText },
    { label: 'User Roles', href: '/dashboard/super-admin/roles', icon: UserCog },
    { label: 'System Health', href: '/dashboard/super-admin/system', icon: Activity },
    { label: 'Settings', href: '/dashboard/super-admin/settings', icon: Settings },
    { label: 'Fraud Thresholds', href: '/dashboard/super-admin/settings/fraud-thresholds', icon: SlidersHorizontal },
  ],
};

/**
 * Get sidebar items for a given role
 */
export function getSidebarItems(role: string): NavItem[] {
  return sidebarConfig[role as UserRole] || [];
}

/**
 * Get dashboard route for a given role
 */
export function getDashboardRoute(role: string): string {
  return roleRouteMap[role as UserRole] || '/unauthorized';
}

/**
 * All valid user roles — re-exported from shared constants
 */
export const ALL_ROLES: readonly UserRole[] = SHARED_ALL_ROLES;

export { getRoleDisplayName };
