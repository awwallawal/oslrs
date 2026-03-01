/**
 * ViewAsDashboardPage — View-As dashboard shell rendering target role's content
 *
 * Reads the target role from URL params, renders ViewAsBanner at top,
 * target role's sidebar items, and dashboard summary data from proxy endpoints.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { useParams, Link, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  ClipboardList,
  FileText,
  RefreshCw,
  MessageSquare,
  BarChart3,
  Database,
  AlertTriangle,
  Keyboard,
  CheckCircle,
  ShieldCheck,
  Download,
  TrendingUp,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { getRoleDisplayName } from '@oslsr/types';
import { ViewAsBanner } from '../components/ViewAsBanner';
import { useViewAs } from '../context/ViewAsContext';
import { useViewAsDashboardData } from '../hooks/useViewAs';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Users,
  ClipboardList,
  FileText,
  RefreshCw,
  MessageSquare,
  BarChart3,
  Database,
  AlertTriangle,
  Keyboard,
  CheckCircle,
  ShieldCheck,
  Download,
  TrendingUp,
  Building2,
  ListChecks: ClipboardList,
  ClipboardCheck: ShieldCheck,
};

interface SidebarItem {
  label: string;
  href: string;
  icon: string;
}

const SIDEBAR_MAP: Record<string, SidebarItem[]> = {
  enumerator: [
    { label: 'Home', href: '', icon: 'Home' },
    { label: 'Surveys', href: 'survey', icon: 'ClipboardList' },
    { label: 'Drafts', href: 'drafts', icon: 'FileText' },
    { label: 'Sync Status', href: 'sync', icon: 'RefreshCw' },
    { label: 'Messages', href: 'messages', icon: 'MessageSquare' },
  ],
  supervisor: [
    { label: 'Home', href: '', icon: 'Home' },
    { label: 'Team Progress', href: 'team', icon: 'Users' },
    { label: 'Productivity', href: 'productivity', icon: 'BarChart3' },
    { label: 'Registry', href: 'registry', icon: 'Database' },
    { label: 'Fraud Alerts', href: 'fraud', icon: 'AlertTriangle' },
    { label: 'Messages', href: 'messages', icon: 'MessageSquare' },
  ],
  data_entry_clerk: [
    { label: 'Home', href: '', icon: 'Home' },
    { label: 'Entry Queue', href: 'surveys', icon: 'ClipboardList' },
    { label: 'Completed', href: 'completed', icon: 'CheckCircle' },
    { label: 'My Stats', href: 'stats', icon: 'BarChart3' },
  ],
  verification_assessor: [
    { label: 'Home', href: '', icon: 'Home' },
    { label: 'Audit Queue', href: 'queue', icon: 'ShieldCheck' },
    { label: 'Registry', href: 'registry', icon: 'Database' },
    { label: 'Completed', href: 'completed', icon: 'CheckCircle' },
    { label: 'Export Data', href: 'export', icon: 'Download' },
  ],
  government_official: [
    { label: 'Home', href: '', icon: 'Home' },
    { label: 'Statistics', href: 'stats', icon: 'BarChart3' },
    { label: 'Trends', href: 'trends', icon: 'TrendingUp' },
    { label: 'Registry', href: 'registry', icon: 'Database' },
    { label: 'Export', href: 'export', icon: 'Download' },
  ],
};

export default function ViewAsDashboardPage() {
  const { role } = useParams<{ role: string }>();
  const location = useLocation();
  const { isViewingAs, isLoading: contextLoading } = useViewAs();
  const { data: dashboardData, isLoading: dataLoading } = useViewAsDashboardData(isViewingAs);

  if (contextLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!role || !isViewingAs) return null;

  const sidebarItems = SIDEBAR_MAP[role] ?? [];
  const roleDisplayName = getRoleDisplayName(role);
  const basePath = `/dashboard/super-admin/view-as/${role}`;

  return (
    <div className="flex min-h-screen flex-col" data-testid="view-as-dashboard">
      <ViewAsBanner />

      <div className="flex flex-1">
        {/* Target Role Sidebar */}
        <nav
          className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white lg:block"
          data-testid="view-as-sidebar"
          aria-label={`${roleDisplayName} navigation (View-As)`}
        >
          <div className="border-b border-neutral-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              Viewing: {roleDisplayName}
            </p>
          </div>
          <ul className="space-y-0.5 p-2">
            {sidebarItems.map((item) => {
              const Icon = ICON_MAP[item.icon] ?? Home;
              const fullHref = item.href ? `${basePath}/${item.href}` : basePath;
              const isActive =
                item.href === ''
                  ? location.pathname === basePath
                  : location.pathname.startsWith(fullHref);

              return (
                <li key={item.href}>
                  <Link
                    to={fullHref}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-amber-50 font-medium text-amber-700'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <ViewAsDashboardContent
              role={role}
              roleDisplayName={roleDisplayName}
              dashboardData={dashboardData}
              isLoading={dataLoading}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

interface DashboardContentProps {
  role: string;
  roleDisplayName: string;
  dashboardData: ReturnType<typeof useViewAsDashboardData>['data'];
  isLoading: boolean;
}

function ViewAsDashboardContent({ role, roleDisplayName, dashboardData, isLoading }: DashboardContentProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="view-as-content">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">
          {roleDisplayName} Dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Read-only preview of the {roleDisplayName.toLowerCase()} experience
        </p>
      </div>

      {/* Dashboard Cards */}
      {dashboardData?.cards && dashboardData.cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboardData.cards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
              data-testid="dashboard-card"
            >
              <p className="text-sm font-medium text-neutral-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{card.value}</p>
              {card.description && (
                <p className="mt-1 text-xs text-neutral-400">{card.description}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">
            Dashboard data for {roleDisplayName.toLowerCase()} will appear here.
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            This is a read-only preview of the {roleDisplayName.toLowerCase()}'s view.
          </p>
        </div>
      )}

      {/* Read-Only Notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-800">Read-Only Mode</p>
        <p className="mt-1 text-xs text-amber-600">
          All interactive elements are disabled. You are viewing this dashboard as a {roleDisplayName.toLowerCase()}.
          Click "Exit View-As" in the banner above to return to your admin dashboard.
        </p>
      </div>
    </div>
  );
}
