/**
 * Shared Analytics Tab Content
 *
 * Story 8.2: Eliminates duplication between SurveyAnalyticsPage and OfficialStatsPage
 * by extracting the common TabsContent blocks (Demographics, Employment, Household,
 * Trends, Equity) into a single reusable component.
 *
 * Each tab is wrapped in an ErrorBoundary so a single chart crash does not take down
 * the entire page. The boundary resets when the active tab changes (via resetKey).
 */

import type {
  DemographicStats,
  EmploymentStats,
  HouseholdStats,
  TrendDataPoint,
  EquityData,
} from '@oslsr/types';
import { TabsContent } from '../../../components/ui/tabs';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { ChartExportButton } from './charts/ChartExportButton';
import { DemographicCharts } from './charts/DemographicCharts';
import { EmploymentCharts } from './charts/EmploymentCharts';
import { HouseholdCharts } from './charts/HouseholdCharts';
import { TrendsCharts } from './charts/TrendsCharts';
import { EquityMetrics } from './charts/EquityMetrics';

// --- Tab configuration types ---

interface TabDataMap {
  demographics?: DemographicStats;
  demoLoading: boolean;
  demoError: Error | null;
  onRetryDemo?: () => void;

  employment?: EmploymentStats;
  empLoading: boolean;
  empError: Error | null;
  onRetryEmp?: () => void;

  household?: HouseholdStats;
  hhLoading: boolean;
  hhError: Error | null;
  onRetryHh?: () => void;

  trends?: TrendDataPoint[];
  trendsLoading: boolean;
  trendsError: Error | null;
  onRetryTrends?: () => void;

  equityData?: EquityData;
  equityLoading: boolean;
  equityError: Error | null;
  onRetryEquity?: () => void;
}

interface AnalyticsTabsProps extends TabDataMap {
  /** Current active tab value — used as ErrorBoundary resetKey. */
  activeTab: string;
}

// --- Shared ErrorBoundary wrapper per tab ---

function TabErrorBoundary({ tabName, resetKey, children }: { tabName: string; resetKey: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallbackProps={{
        title: `${tabName} chart error`,
        description: 'This chart encountered an unexpected error. Other tabs still work.',
        showHomeLink: false,
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

// --- Exported component ---

/**
 * Renders the 5 shared analytics TabsContent blocks: Demographics, Employment,
 * Household, Trends, and Equity. Each is wrapped in an ErrorBoundary that resets
 * when the active tab changes.
 */
export function AnalyticsTabsContent({
  activeTab,
  demographics,
  demoLoading,
  demoError,
  onRetryDemo,
  employment,
  empLoading,
  empError,
  onRetryEmp,
  household,
  hhLoading,
  hhError,
  onRetryHh,
  trends,
  trendsLoading,
  trendsError,
  onRetryTrends,
  equityData,
  equityLoading,
  equityError,
  onRetryEquity,
}: AnalyticsTabsProps) {
  return (
    <>
      <TabsContent value="demographics">
        <TabErrorBoundary tabName="Demographics" resetKey={activeTab}>
          <div className="flex justify-end mb-2">
            <ChartExportButton
              data={demographics?.genderDistribution ?? []}
              filename="demographics-gender"
            />
          </div>
          <DemographicCharts data={demographics} isLoading={demoLoading} error={demoError} onRetry={onRetryDemo} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="employment">
        <TabErrorBoundary tabName="Employment" resetKey={activeTab}>
          <div className="flex justify-end mb-2">
            <ChartExportButton
              data={employment?.workStatusBreakdown ?? []}
              filename="employment-status"
            />
          </div>
          <EmploymentCharts data={employment} isLoading={empLoading} error={empError} onRetry={onRetryEmp} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="household">
        <TabErrorBoundary tabName="Household" resetKey={activeTab}>
          <div className="flex justify-end mb-2">
            <ChartExportButton
              data={household?.householdSizeDistribution ?? []}
              filename="household-size"
            />
          </div>
          <HouseholdCharts data={household} isLoading={hhLoading} error={hhError} onRetry={onRetryHh} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="trends">
        <TabErrorBoundary tabName="Trends" resetKey={activeTab}>
          <div className="flex justify-end mb-2">
            <ChartExportButton
              data={trends ?? []}
              filename="registration-trends"
            />
          </div>
          <TrendsCharts data={trends ?? []} isLoading={trendsLoading} error={trendsError} onRetry={onRetryTrends} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="equity">
        <TabErrorBoundary tabName="Equity" resetKey={activeTab}>
          <EquityMetrics
            data={equityData}
            isLoading={equityLoading}
            error={equityError}
            onRetry={onRetryEquity}
          />
        </TabErrorBoundary>
      </TabsContent>
    </>
  );
}
