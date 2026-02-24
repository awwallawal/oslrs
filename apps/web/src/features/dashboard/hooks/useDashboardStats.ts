import type { DailyCount } from '../../forms/api/submission.api';

/**
 * Fill missing dates with count: 0 for the full range.
 * Returns an array of length `days` with no gaps.
 */
export function fillDateGaps(data: DailyCount[], days: number): DailyCount[] {
  const map = new Map(data.map((d) => [d.date, d.count]));
  const result: DailyCount[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, count: map.get(dateStr) ?? 0 });
  }

  return result;
}

/**
 * Extract today's count from the filled data.
 */
export function getTodayCount(data: DailyCount[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return data.find((d) => d.date === today)?.count ?? 0;
}

/**
 * Compute summary stats for the summary strip.
 */
export function computeSummary(data: DailyCount[]): { avg: number; best: number; total: number } {
  if (data.length === 0) return { avg: 0, best: 0, total: 0 };
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const best = Math.max(...data.map((d) => d.count));
  const avg = Math.round(total / data.length);
  return { avg, best, total };
}
