/**
 * Sidebar Navigation Configuration
 *
 * Per-role sidebar navigation items for the DashboardLayout.
 * Each role has a specific set of nav items with icons from lucide-react.
 *
 * Story 2.5-1 AC5: Dynamic Sidebar Items
 * - Enumerator/Public User: 3-4 items (mobile-first)
 * - Supervisor: 6-8 items
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
} from 'lucide-react';

/**
 * User roles matching the backend role enum
 */
export type UserRole =
  | 'super_admin'
  | 'supervisor'
  | 'enumerator'
  | 'clerk'
  | 'assessor'
  | 'official'
  | 'public_user';

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
  clerk: '/dashboard/clerk',
  assessor: '/dashboard/assessor',
  official: '/dashboard/official',
  public_user: '/dashboard/public',
};

/**
 * Role display names
 */
export const roleDisplayNames: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  enumerator: 'Enumerator',
  clerk: 'Data Entry Clerk',
  assessor: 'Verification Assessor',
  official: 'Government Official',
  public_user: 'Public User',
};

/**
 * Sidebar configuration by role
 *
 * AC5 Requirements:
 * - Enumerator: Home, Start Survey, Drafts, Sync Status
 * - Public User: Home, Survey Status, Marketplace, Support
 * - Clerk: Home, Entry Queue, Completed, My Stats
 * - Supervisor: Home, Team Progress, Fraud Alerts, Messages (6-8 items)
 * - Assessor: Home, Audit Queue, Completed, Evidence
 * - Official: Home, Statistics, Trends, Export
 * - Super Admin: 12+ items
 */
export const sidebarConfig: Record<UserRole, NavItem[]> = {
  enumerator: [
    { label: 'Home', href: '/dashboard/enumerator', icon: Home },
    { label: 'Start Survey', href: '/dashboard/enumerator/survey', icon: FileText },
    { label: 'Drafts', href: '/dashboard/enumerator/drafts', icon: Save },
    { label: 'Sync Status', href: '/dashboard/enumerator/sync', icon: RefreshCw },
  ],

  public_user: [
    { label: 'Home', href: '/dashboard/public', icon: Home },
    { label: 'Survey Status', href: '/dashboard/public/surveys', icon: ClipboardList },
    { label: 'Marketplace', href: '/dashboard/public/marketplace', icon: Briefcase },
    { label: 'Support', href: '/dashboard/public/support', icon: HelpCircle },
  ],

  clerk: [
    { label: 'Home', href: '/dashboard/clerk', icon: Home },
    { label: 'Entry Queue', href: '/dashboard/clerk/queue', icon: ListOrdered },
    { label: 'Completed', href: '/dashboard/clerk/completed', icon: CheckSquare },
    { label: 'My Stats', href: '/dashboard/clerk/stats', icon: BarChart },
  ],

  supervisor: [
    { label: 'Home', href: '/dashboard/supervisor', icon: Home },
    { label: 'Team Progress', href: '/dashboard/supervisor/team', icon: Users },
    { label: 'Assignments', href: '/dashboard/supervisor/assignments', icon: ClipboardList },
    { label: 'Fraud Alerts', href: '/dashboard/supervisor/fraud', icon: AlertTriangle },
    { label: 'Messages', href: '/dashboard/supervisor/messages', icon: MessageSquare },
    { label: 'Reports', href: '/dashboard/supervisor/reports', icon: BarChart },
  ],

  assessor: [
    { label: 'Home', href: '/dashboard/assessor', icon: Home },
    { label: 'Audit Queue', href: '/dashboard/assessor/queue', icon: FileSearch },
    { label: 'Completed', href: '/dashboard/assessor/completed', icon: CheckCircle },
    { label: 'Evidence', href: '/dashboard/assessor/evidence', icon: Shield },
  ],

  official: [
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
    { label: 'Audit Logs', href: '/dashboard/super-admin/logs', icon: ScrollText },
    { label: 'User Roles', href: '/dashboard/super-admin/roles', icon: UserCog },
    { label: 'System Health', href: '/dashboard/super-admin/system', icon: Activity },
    { label: 'Settings', href: '/dashboard/super-admin/settings', icon: Settings },
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
 * Get display name for a role
 */
export function getRoleDisplayName(role: string): string {
  return roleDisplayNames[role as UserRole] || 'User';
}

/**
 * All valid user roles (for validation)
 */
export const ALL_ROLES: UserRole[] = [
  'super_admin',
  'supervisor',
  'enumerator',
  'clerk',
  'assessor',
  'official',
  'public_user',
];
