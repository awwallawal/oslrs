/**
 * View-As Data Service — Returns role-scoped dashboard data for View-As mode
 *
 * Provides aggregated dashboard summaries for each viewable role,
 * optionally scoped to a target LGA for field roles.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'view-as-data-service' });

export interface ViewAsDashboardSummary {
  role: string;
  lgaId: string | null;
  cards: Array<{
    label: string;
    value: number | string;
    description?: string;
  }>;
  recentActivity: Array<{
    label: string;
    timestamp: string;
  }>;
}

export class ViewAsDataService {
  /**
   * Get dashboard summary data scoped to the target role and optional LGA.
   */
  static async getDashboardSummary(targetRole: string, targetLgaId: string | null): Promise<ViewAsDashboardSummary> {
    switch (targetRole) {
      case 'enumerator':
        return ViewAsDataService.getEnumeratorSummary(targetLgaId!);
      case 'supervisor':
        return ViewAsDataService.getSupervisorSummary(targetLgaId!);
      case 'data_entry_clerk':
        return ViewAsDataService.getClerkSummary();
      case 'verification_assessor':
        return ViewAsDataService.getAssessorSummary();
      case 'government_official':
        return ViewAsDataService.getOfficialSummary();
      default:
        return { role: targetRole, lgaId: targetLgaId, cards: [], recentActivity: [] };
    }
  }

  private static async getEnumeratorSummary(lgaId: string): Promise<ViewAsDashboardSummary> {
    try {
      const submissionCountResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM submissions WHERE lga_id = ${lgaId}`,
      );
      const total = parseInt((submissionCountResult.rows[0] as any)?.total ?? '0', 10);

      const todayResult = await db.execute(
        sql`SELECT COUNT(*) as today FROM submissions WHERE lga_id = ${lgaId} AND created_at >= CURRENT_DATE`,
      );
      const today = parseInt((todayResult.rows[0] as any)?.today ?? '0', 10);

      return {
        role: 'enumerator',
        lgaId,
        cards: [
          { label: 'Total Submissions', value: total, description: 'All submissions in this LGA' },
          { label: 'Today', value: today, description: 'Submissions today' },
        ],
        recentActivity: [],
      };
    } catch {
      logger.warn('Failed to fetch enumerator summary for View-As');
      return { role: 'enumerator', lgaId, cards: [], recentActivity: [] };
    }
  }

  private static async getSupervisorSummary(lgaId: string): Promise<ViewAsDashboardSummary> {
    try {
      const teamResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'enumerator' AND u.lga_id = ${lgaId} AND u.status = 'active'`,
      );
      const teamCount = parseInt((teamResult.rows[0] as any)?.total ?? '0', 10);

      const submissionResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM submissions WHERE lga_id = ${lgaId}`,
      );
      const submissionCount = parseInt((submissionResult.rows[0] as any)?.total ?? '0', 10);

      return {
        role: 'supervisor',
        lgaId,
        cards: [
          { label: 'Team Members', value: teamCount, description: 'Active enumerators in this LGA' },
          { label: 'Team Submissions', value: submissionCount, description: 'Total submissions for this LGA' },
        ],
        recentActivity: [],
      };
    } catch {
      logger.warn('Failed to fetch supervisor summary for View-As');
      return { role: 'supervisor', lgaId, cards: [], recentActivity: [] };
    }
  }

  private static async getClerkSummary(): Promise<ViewAsDashboardSummary> {
    try {
      const result = await db.execute(
        sql`SELECT COUNT(*) as total FROM submissions WHERE source = 'data_entry_clerk'`,
      );
      const total = parseInt((result.rows[0] as any)?.total ?? '0', 10);

      return {
        role: 'data_entry_clerk',
        lgaId: null,
        cards: [
          { label: 'Total Entries', value: total, description: 'All data entry submissions' },
        ],
        recentActivity: [],
      };
    } catch {
      logger.warn('Failed to fetch clerk summary for View-As');
      return { role: 'data_entry_clerk', lgaId: null, cards: [], recentActivity: [] };
    }
  }

  private static async getAssessorSummary(): Promise<ViewAsDashboardSummary> {
    try {
      const pendingResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM fraud_detections WHERE status = 'pending'`,
      );
      const pending = parseInt((pendingResult.rows[0] as any)?.total ?? '0', 10);

      const reviewedResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM fraud_detections WHERE status != 'pending'`,
      );
      const reviewed = parseInt((reviewedResult.rows[0] as any)?.total ?? '0', 10);

      return {
        role: 'verification_assessor',
        lgaId: null,
        cards: [
          { label: 'Pending Reviews', value: pending, description: 'Awaiting assessment' },
          { label: 'Reviewed', value: reviewed, description: 'Completed assessments' },
        ],
        recentActivity: [],
      };
    } catch {
      logger.warn('Failed to fetch assessor summary for View-As');
      return { role: 'verification_assessor', lgaId: null, cards: [], recentActivity: [] };
    }
  }

  private static async getOfficialSummary(): Promise<ViewAsDashboardSummary> {
    try {
      const respondentResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM respondents`,
      );
      const total = parseInt((respondentResult.rows[0] as any)?.total ?? '0', 10);

      const todayResult = await db.execute(
        sql`SELECT COUNT(*) as today FROM respondents WHERE created_at >= CURRENT_DATE`,
      );
      const today = parseInt((todayResult.rows[0] as any)?.today ?? '0', 10);

      return {
        role: 'government_official',
        lgaId: null,
        cards: [
          { label: 'Total Respondents', value: total, description: 'Registry total' },
          { label: 'Today Registrations', value: today, description: 'New today' },
        ],
        recentActivity: [],
      };
    } catch {
      logger.warn('Failed to fetch official summary for View-As');
      return { role: 'government_official', lgaId: null, cards: [], recentActivity: [] };
    }
  }

  /**
   * Get sidebar items for a target role. Returns the config-based sidebar items
   * with hrefs rewritten for View-As routes.
   */
  static getSidebarItems(targetRole: string): Array<{ label: string; href: string; icon: string }> {
    const sidebarMap: Record<string, Array<{ label: string; href: string; icon: string }>> = {
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
        { label: 'Entry Queue', href: 'surveys', icon: 'ListChecks' },
        { label: 'Completed', href: 'completed', icon: 'CheckCircle' },
        { label: 'My Stats', href: 'stats', icon: 'BarChart3' },
      ],
      verification_assessor: [
        { label: 'Home', href: '', icon: 'Home' },
        { label: 'Audit Queue', href: 'queue', icon: 'ClipboardCheck' },
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

    return sidebarMap[targetRole] ?? [];
  }
}
