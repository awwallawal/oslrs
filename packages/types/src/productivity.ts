/**
 * Productivity Types (Story 5.6a)
 *
 * Shared types for the team productivity feature.
 * Used by both API and web packages.
 */

export type ProductivityStatus = 'complete' | 'on_track' | 'behind' | 'inactive';

export type ProductivityTrend = 'up' | 'down' | 'flat';

export interface StaffProductivityRow {
  id: string;
  fullName: string;
  todayCount: number;
  target: number;
  percent: number;
  status: ProductivityStatus;
  trend: ProductivityTrend;
  weekCount: number;
  weekTarget: number;
  monthCount: number;
  monthTarget: number;
  approvedCount: number;
  rejectedCount: number;
  rejRate: number; // percentage
  daysActive: string; // "5/7" format
  lastActiveAt: string | null; // ISO 8601
}

export interface ProductivityFilterParams {
  period: 'today' | 'week' | 'month' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ProductivitySummary {
  totalSubmissions: number;
  avgPerDay: number;
  totalTarget: number;
  overallPercent: number;
  completedCount: number;
  behindCount: number;
  inactiveCount: number;
}

export interface ProductivityTarget {
  defaultTarget: number;
  lgaOverrides: Array<{ lgaId: string; lgaName: string; dailyTarget: number }>;
}

export interface TeamProductivityResponse {
  data: StaffProductivityRow[];
  summary: ProductivitySummary;
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
    };
  };
}

/**
 * Story 5.6b: Cross-LGA Productivity Types
 */

/** Super Admin all-staff row (extends StaffProductivityRow) */
export interface StaffProductivityRowExtended extends StaffProductivityRow {
  role: 'enumerator' | 'data_entry_clerk' | 'supervisor';
  lgaId: string;
  lgaName: string;
  supervisorName: string | null; // null = supervisorless LGA → display "— Direct"
}

/** LGA Comparison row (Super Admin) */
export interface LgaProductivityRow {
  lgaId: string;
  lgaName: string;
  staffingModel: string; // "Full (1+5)", "Lean (1+1)", "No Supervisor (3)"
  hasSupervisor: boolean;
  enumeratorCount: number;
  supervisorName: string | null;
  todayTotal: number;
  lgaTarget: number;
  percent: number;
  avgPerEnumerator: number;
  bestPerformer: { name: string; count: number } | null;
  lowestPerformer: { name: string; count: number } | null;
  rejRate: number;
  trend: ProductivityTrend;
}

/** Government Official aggregate row (no names) */
export interface LgaAggregateSummaryRow {
  lgaId: string;
  lgaName: string;
  activeStaff: number;
  todayTotal: number;
  dailyTarget: number;
  percent: number;
  weekTotal: number;
  weekAvgPerDay: number;
  monthTotal: number;
  completionRate: number; // month total / month target
  trend: ProductivityTrend;
}

/** Cross-LGA filter params (Super Admin) */
export interface CrossLgaFilterParams {
  period: 'today' | 'week' | 'month' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  lgaIds?: string[]; // Multi-select LGA filter
  roleId?: string; // Filter by role (Staff tab)
  supervisorId?: string; // Filter by supervisor (Staff tab)
  staffingModel?: string; // Filter: 'all' | 'full' | 'lean' | 'no_supervisor' (LGA tab)
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Response for cross-LGA staff productivity */
export interface CrossLgaStaffResponse {
  data: StaffProductivityRowExtended[];
  summary: ProductivitySummary & { supervisorlessLgaCount: number };
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
    };
  };
}

/** Response for LGA comparison */
export interface LgaComparisonResponse {
  data: LgaProductivityRow[];
  summary: {
    totalLgas: number;
    totalSubmissions: number;
    overallPercent: number;
    supervisorlessCount: number;
  };
}

/** Response for LGA aggregate summary (Government Official) */
export interface LgaSummaryResponse {
  data: LgaAggregateSummaryRow[];
  summary: {
    totalLgas: number;
    totalActiveStaff: number;
    overallCompletionRate: number;
    totalSubmissionsToday: number;
  };
}
