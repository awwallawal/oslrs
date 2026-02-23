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
