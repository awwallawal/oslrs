/**
 * Report API shared types
 *
 * Story 5.1: High-Level Policy Dashboard
 * Shared between API service and web frontend.
 */

export interface OverviewStats {
  totalRespondents: number;
  todayRegistrations: number;
  yesterdayRegistrations: number;
  lgasCovered: number;
  sourceBreakdown: {
    enumerator: number;
    public: number;
    clerk: number;
  };
}

export interface SkillDistribution {
  skill: string;
  count: number;
}

export interface LgaBreakdown {
  lgaCode: string;
  lgaName: string;
  count: number;
}

export interface DailyTrend {
  date: string;
  count: number;
}
