/**
 * Demographic Analytics Charts
 *
 * Story 8.2: Super Admin / Government Official Survey Analytics Dashboard
 * Renders demographic distribution charts from survey analytics data.
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import {
  CHART_COLORS,
  SUPPRESSED_COLOR,
  bucketColor,
} from './chart-utils';
import type { DemographicStats, FrequencyBucket } from '@oslsr/types';

// --- Props ---

interface DemographicChartsProps {
  data?: DemographicStats;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

// --- Helpers ---

/** Format a FrequencyBucket for chart display, masking suppressed values. */
function toBucketDisplay(bucket: FrequencyBucket) {
  if (bucket.suppressed) {
    return {
      label: bucket.label,
      count: 0,
      percentage: 0,
      displayCount: '< 5',
      suppressed: true,
    };
  }
  return {
    label: bucket.label,
    count: bucket.count ?? 0,
    percentage: bucket.percentage ?? 0,
    displayCount: String(bucket.count ?? 0),
    suppressed: false,
  };
}

function prepareBuckets(buckets: FrequencyBucket[]) {
  return buckets.map(toBucketDisplay);
}

/** Compute total from non-suppressed buckets for percentage display. */
function bucketTotal(buckets: FrequencyBucket[]): number {
  return buckets.reduce((sum, b) => sum + (b.suppressed ? 0 : (b.count ?? 0)), 0);
}

// --- Tooltip components ---

function BucketTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ReturnType<typeof toBucketDisplay> }> }) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;

  if (item.suppressed) {
    return (
      <div className="bg-white p-2 rounded shadow border text-sm">
        <p className="font-medium">{item.label}</p>
        <p className="text-neutral-500">Suppressed: fewer than 5 responses</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-2 rounded shadow border text-sm">
      <p className="font-medium">{item.label}</p>
      <p>Count: <strong>{item.count.toLocaleString()}</strong></p>
      <p>Percentage: <strong>{item.percentage.toFixed(1)}%</strong></p>
    </div>
  );
}

// --- Chart section header ---

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Individual chart renderers ---

function GenderPieChart({ buckets }: { buckets: FrequencyBucket[] }) {
  const data = prepareBuckets(buckets);
  const total = bucketTotal(buckets);

  return (
    <ChartCard title="Gender Distribution">
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={(props: any) => {
            const entry = props as {
              label: string;
              suppressed: boolean;
              percentage: number;
            };
            return entry.suppressed ? '< 5' : `${entry.label} (${entry.percentage.toFixed(1)}%)`;
          }}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.label || index}
              fill={entry.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const item = payload[0].payload;
            if (item.suppressed) {
              return (
                <div className="bg-white p-2 rounded shadow border text-sm">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-neutral-500">Suppressed: fewer than 5 responses</p>
                </div>
              );
            }
            return (
              <div className="bg-white p-2 rounded shadow border text-sm">
                <p className="font-medium">{item.label}</p>
                <p>Count: <strong>{item.count.toLocaleString()}</strong></p>
                <p>Percentage: <strong>{total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0'}%</strong></p>
              </div>
            );
          }}
        />
        <Legend />
      </PieChart>
    </ChartCard>
  );
}

function AgeBarChart({ buckets }: { buckets: FrequencyBucket[] }) {
  const data = prepareBuckets(buckets);

  return (
    <ChartCard title="Age Distribution">
      <BarChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={BucketTooltip as any} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Respondents">
          {data.map((entry, index) => (
            <Cell
              key={entry.label || index}
              fill={entry.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

function EducationBarChart({ buckets }: { buckets: FrequencyBucket[] }) {
  const data = prepareBuckets(buckets);

  return (
    <ChartCard title="Education Distribution">
      <BarChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={BucketTooltip as any} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Respondents">
          {data.map((entry, index) => (
            <Cell
              key={entry.label || index}
              fill={entry.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

function MaritalBarChart({ buckets }: { buckets: FrequencyBucket[] }) {
  const data = prepareBuckets(buckets);

  return (
    <ChartCard title="Marital Status">
      <BarChart data={data} layout="vertical" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11 }}
          width={120}
          axisLine={false}
          tickLine={false}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip content={BucketTooltip as any} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Respondents">
          {data.map((entry, index) => (
            <Cell
              key={entry.label || index}
              fill={entry.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

function LgaBarChart({ buckets }: { buckets: FrequencyBucket[] }) {
  const data = prepareBuckets(buckets);
  const chartHeight = Math.max(320, data.length * 24);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">LGA Distribution</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11 }}
                width={140}
                axisLine={false}
                tickLine={false}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={BucketTooltip as any} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Respondents">
                {data.map((entry, index) => (
                  <Cell
                    key={entry.label || index}
                    fill={entry.suppressed ? SUPPRESSED_COLOR : CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Consent stat cards ---

function ConsentStatCard({ label, buckets }: { label: string; buckets: FrequencyBucket[] }) {
  const hasSuppressed = buckets.some((b) => b.suppressed);
  const optInBucket = buckets.find(
    (b) => b.label.toLowerCase() === 'yes' || b.label.toLowerCase() === 'true',
  );

  let displayValue = '\u2014'; // em-dash
  let subtitle = '';

  if (hasSuppressed) {
    displayValue = '\u2014';
    subtitle = 'Insufficient data';
  } else if (optInBucket && optInBucket.percentage != null) {
    displayValue = `${optInBucket.percentage.toFixed(1)}%`;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8">
          <span className="text-4xl font-bold text-[#9C1E23]">{displayValue}</span>
          {subtitle && (
            <span className="text-sm text-neutral-500 mt-2">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Disability prevalence stat card ---

function DisabilityStatCard({ buckets }: { buckets: FrequencyBucket[] }) {
  const hasSuppressed = buckets.some((b) => b.suppressed);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="border-l-4 border-[#9C1E23] pl-3">
          <CardTitle className="text-base">Disability Prevalence</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6">
          {hasSuppressed ? (
            <>
              <span className="text-4xl font-bold text-[#9C1E23]">{'\u2014'}</span>
              <span className="text-sm text-neutral-500 mt-2">Insufficient data</span>
            </>
          ) : (
            <div className="space-y-2 w-full max-w-xs">
              {buckets.map((b, i) => {
                const pct = b.percentage != null ? `${b.percentage.toFixed(1)}%` : '\u2014';
                const count = b.count != null ? b.count.toLocaleString() : '\u2014';
                return (
                  <div key={b.label || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: bucketColor(b, i) }}
                      />
                      <span className="text-sm font-medium">{b.label}</span>
                    </div>
                    <span className="text-sm text-neutral-600">
                      {pct} <span className="text-neutral-400">({count})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main component ---

export function DemographicCharts({ data, isLoading, error, onRetry, className }: DemographicChartsProps) {
  if (isLoading) {
    return (
      <div data-testid="demographic-charts" className={className}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="demographic-charts" className={className}>
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">Unable to load data</p>
              {onRetry && (
                <button onClick={onRetry} className="text-sm text-blue-600 hover:underline">
                  Try again
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="demographic-charts" className={className}>
        <Card>
          <CardContent>
            <div className="text-center text-neutral-400 py-8">
              No data available yet
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="demographic-charts" className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Gender distribution — donut pie chart */}
        <GenderPieChart buckets={data.genderDistribution} />

        {/* 2. Age distribution — vertical bar chart */}
        <AgeBarChart buckets={data.ageDistribution} />

        {/* 3. Education distribution — vertical bar chart */}
        <EducationBarChart buckets={data.educationDistribution} />

        {/* 4. Marital status — horizontal bar chart */}
        <MaritalBarChart buckets={data.maritalDistribution} />

        {/* 5. LGA distribution — horizontal bar chart */}
        <LgaBarChart buckets={data.lgaDistribution} />

        {/* 6. Disability prevalence — stat card */}
        <DisabilityStatCard buckets={data.disabilityPrevalence} />

        {/* 7. Consent rates — stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ConsentStatCard label="Marketplace Opt-in" buckets={data.consentMarketplace} />
          <ConsentStatCard label="Enriched Consent" buckets={data.consentEnriched} />
        </div>
      </div>
    </div>
  );
}
