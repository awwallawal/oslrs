/**
 * Registry Summary Strip — Collapsible Stat Row
 *
 * Story 8.2: Super Admin / Government Official Survey Analytics Dashboard
 * Displays 5 top-level registry metrics in a horizontal strip with
 * collapsible state persisted to localStorage.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Users,
  Briefcase,
  UserCheck,
  Clock,
  Building2,
} from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import type { RegistrySummary } from '@oslsr/types';

// --- Props ---

interface RegistrySummaryStripProps {
  data?: RegistrySummary;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

// --- Persistence helpers ---

const STORAGE_KEY = 'registry-summary-collapsed';

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// --- Stat item sub-component ---

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
}

function StatItem({ icon, label, value, secondary }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="rounded-lg bg-neutral-100 p-2 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-neutral-500 truncate">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {secondary && (
          <p className="text-xs text-neutral-400">{secondary}</p>
        )}
      </div>
    </div>
  );
}

// --- Main component ---

export function RegistrySummaryStrip({
  data,
  isLoading,
  error,
  onRetry,
  className,
}: RegistrySummaryStripProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable; silently ignore
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div data-testid="registry-summary-strip" className={className}>
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} lines={1} className="flex-1 min-w-[160px]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="registry-summary-strip" className={className}>
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

  const iconSize = 18;
  const iconColor = '#9C1E23';

  return (
    <div data-testid="registry-summary-strip" className={className}>
      <Card>
        <CardContent>
          {/* Header with toggle */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              Registry Summary
            </h3>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-1 hover:bg-neutral-100 transition-colors"
              aria-label={collapsed ? 'Expand registry summary' : 'Collapse registry summary'}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronDown size={18} className="text-neutral-500" />
              ) : (
                <ChevronUp size={18} className="text-neutral-500" />
              )}
            </button>
          </div>

          {/* Stat cards row */}
          {!collapsed && (
            <div className="flex flex-wrap gap-4">
              {/* 1. Total Respondents */}
              <StatItem
                icon={<Users size={iconSize} color={iconColor} />}
                label="Total Respondents"
                value={data?.totalRespondents != null
                  ? data.totalRespondents.toLocaleString()
                  : '\u2014'}
              />

              {/* 2. Employed */}
              <StatItem
                icon={<Briefcase size={iconSize} color={iconColor} />}
                label="Employed"
                value={data?.employedCount != null
                  ? data.employedCount.toLocaleString()
                  : '\u2014'}
                secondary={data?.employedPct != null
                  ? `${data.employedPct.toFixed(1)}%`
                  : undefined}
              />

              {/* 3. Female */}
              <StatItem
                icon={<UserCheck size={iconSize} color={iconColor} />}
                label="Female"
                value={data?.femaleCount != null
                  ? data.femaleCount.toLocaleString()
                  : '\u2014'}
                secondary={data?.femalePct != null
                  ? `${data.femalePct.toFixed(1)}%`
                  : undefined}
              />

              {/* 4. Avg Age */}
              <StatItem
                icon={<Clock size={iconSize} color={iconColor} />}
                label="Avg Age"
                value={data?.avgAge != null
                  ? String(data.avgAge)
                  : '\u2014'}
              />

              {/* 5. Business Owners */}
              <StatItem
                icon={<Building2 size={iconSize} color={iconColor} />}
                label="Business Owners"
                value={data?.businessOwners != null
                  ? data.businessOwners.toLocaleString()
                  : '\u2014'}
                secondary={data?.businessOwnersPct != null
                  ? `${data.businessOwnersPct.toFixed(1)}%`
                  : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
