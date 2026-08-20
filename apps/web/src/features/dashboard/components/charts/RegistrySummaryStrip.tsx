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
  ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import type { RegistrySummary, RegistryTotals } from '@oslsr/types';
import {
  TOTAL_RESPONDENTS_LABEL,
  WITH_ANSWERS_LABEL,
  WITH_ANSWERS_CAPTION,
  ofAnswersCaption,
  pctOfAnswersCaption,
} from '../../utils/registry-copy';

// --- Props ---

interface RegistrySummaryStripProps {
  data?: RegistrySummary;
  /**
   * Story 12-5 AC3 — the honest registry total (12-4's aggregate).
   *
   * The strip used to render `data.totalRespondents` under the label "Total
   * Respondents", which sat directly below the page header's "{n} records" and
   * disagreed with it: the header counted registered people, the strip counted
   * answer-bearing submissions. Two numbers that should reconcile, silently
   * differing. The total now comes from here so they agree, and `data`'s count
   * is shown as its own "With Answers" item.
   *
   * When absent, the total renders as an em-dash rather than falling back to
   * `data.totalRespondents` — reinstating that fallback would reinstate the bug.
   */
  totals?: RegistryTotals;
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
  testId?: string;
}

function StatItem({ icon, label, value, secondary, testId }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 min-w-0" data-testid={testId}>
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
  totals,
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

  // The percentages below are computed inside `getRegistrySummary` over ITS own
  // count, so the caption names that denominator rather than `totals.withAnswers`
  // — the two are the same number today but are scoped differently (submission
  // vs respondent) and can drift until 12-4 repoints the summary read.
  const pctDenominator = data?.totalRespondents;

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
              {/* 1. Total Respondents \u2014 registered PEOPLE (12-4 aggregate) */}
              <StatItem
                icon={<Users size={iconSize} color={iconColor} />}
                label={TOTAL_RESPONDENTS_LABEL}
                value={totals?.totalRespondents != null
                  ? totals.totalRespondents.toLocaleString()
                  : '\u2014'}
                secondary="registered people"
                testId="strip-total-respondents"
              />

              {/* 2. With Answers \u2014 the subset whose answers are on file */}
              <StatItem
                icon={<ClipboardCheck size={iconSize} color={iconColor} />}
                label={WITH_ANSWERS_LABEL}
                value={totals?.withAnswers != null
                  ? totals.withAnswers.toLocaleString()
                  : '\u2014'}
                secondary={WITH_ANSWERS_CAPTION}
                testId="strip-with-answers"
              />

              {/* 3. Employed */}
              <StatItem
                icon={<Briefcase size={iconSize} color={iconColor} />}
                label="Employed"
                value={data?.employedCount != null
                  ? data.employedCount.toLocaleString()
                  : '\u2014'}
                secondary={data?.employedPct != null && pctDenominator != null
                  ? pctOfAnswersCaption(data.employedPct, pctDenominator)
                  : undefined}
              />

              {/* 4. Female */}
              <StatItem
                icon={<UserCheck size={iconSize} color={iconColor} />}
                label="Female"
                value={data?.femaleCount != null
                  ? data.femaleCount.toLocaleString()
                  : '\u2014'}
                secondary={data?.femalePct != null && pctDenominator != null
                  ? pctOfAnswersCaption(data.femalePct, pctDenominator)
                  : undefined}
              />

              {/* 5. Avg Age */}
              <StatItem
                icon={<Clock size={iconSize} color={iconColor} />}
                label="Avg Age"
                value={data?.avgAge != null
                  ? String(data.avgAge)
                  : '\u2014'}
                secondary={pctDenominator != null ? ofAnswersCaption(pctDenominator) : undefined}
              />

              {/* 6. Business Owners */}
              <StatItem
                icon={<Building2 size={iconSize} color={iconColor} />}
                label="Business Owners"
                value={data?.businessOwners != null
                  ? data.businessOwners.toLocaleString()
                  : '\u2014'}
                secondary={data?.businessOwnersPct != null && pctDenominator != null
                  ? pctOfAnswersCaption(data.businessOwnersPct, pctDenominator)
                  : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
