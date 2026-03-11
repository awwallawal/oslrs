/**
 * Equity Metrics — Stat Cards
 *
 * Story 8.2: Super Admin / Government Official Survey Analytics Dashboard
 * Displays pre-computed equity-focused metrics (GPI, employment proxy, informal sector size)
 * as stat cards. Follows the standard { data, isLoading, error, onRetry } chart props pattern.
 *
 * Derivation logic lives in the parent page via `deriveEquityData()` helper.
 */

import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import type { EquityData } from '@oslsr/types';

// --- Props (standard chart pattern) ---

interface EquityMetricsProps {
  data?: EquityData;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

// --- Stat card sub-component ---

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}

function StatCard({ icon, label, value, subtitle }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-5">
        <div className="rounded-lg bg-neutral-100 p-2 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-neutral-500">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Icons (inline SVG to avoid external dependency) ---

function GpiIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9C1E23"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Scale / balance icon */}
      <path d="M12 3v18" />
      <path d="M3 7l3 5h6L15 7" />
      <path d="M9 7l3 5h6L21 7" />
      <line x1="3" y1="7" x2="21" y2="7" />
    </svg>
  );
}

function EmploymentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9C1E23"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Briefcase icon */}
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function InformalIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9C1E23"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Store/shop icon */}
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// --- Main component ---

export function EquityMetrics({
  data,
  isLoading,
  error,
  onRetry,
  className,
}: EquityMetricsProps) {
  if (isLoading) {
    return (
      <div data-testid="equity-metrics" className={className}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="equity-metrics" className={className}>
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

  const gpi = data?.gpiRatio ?? null;
  const employedPct = data?.employmentRatePct ?? null;
  const informalPct = data?.informalSectorPct ?? null;

  return (
    <div data-testid="equity-metrics" className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Gender Parity Index */}
        <StatCard
          icon={<GpiIcon />}
          label="Gender Parity Index"
          value={gpi != null ? gpi.toFixed(2) : '\u2014'}
          subtitle="Female / Male ratio"
        />

        {/* 2. Youth Employment Rate proxy */}
        <StatCard
          icon={<EmploymentIcon />}
          label="Employment Rate (proxy)"
          value={employedPct != null ? `${employedPct.toFixed(1)}%` : '\u2014'}
          subtitle="Cross-tabulation not available from marginals"
        />

        {/* 3. Informal Sector Size */}
        <StatCard
          icon={<InformalIcon />}
          label="Informal Sector"
          value={informalPct != null ? `${informalPct.toFixed(1)}%` : '\u2014'}
          subtitle="Share of employed respondents"
        />
      </div>
    </div>
  );
}
