/**
 * Statistical Tests Service — Story 8.7
 *
 * Pure math functions for inferential statistics.
 * No DB access — functions receive arrays/matrices and return test results.
 * Uses `simple-statistics` for Pearson correlation and linear regression.
 * All other tests implemented from standard formulas.
 */

import {
  chiSquaredDistributionTable,
  sampleCorrelation,
  linearRegression,
  median,
} from 'simple-statistics';
import type {
  ChiSquareResult,
  CorrelationResult,
  GroupComparisonResult,
  ProportionCI,
  EnrollmentForecast,
} from '@oslsr/types';

// ---------------------------------------------------------------------------
// P-value bracket from chi-squared distribution table
// simple-statistics provides a lookup table of critical values, NOT a CDF.
// We compare the test statistic against critical values at known alpha levels.
// ---------------------------------------------------------------------------

/**
 * Determine p-value bracket by comparing test statistic against
 * chi-squared critical values at known alpha levels.
 * Works for any chi-squared-distributed statistic (chi-sq, Kruskal-Wallis H).
 */
export function pValueBracketFromChiSq(statistic: number, df: number): string {
  if (df <= 0) return '>= 0.05';

  const table = chiSquaredDistributionTable;
  // table keys are alpha levels: 0.995, 0.99, 0.975, 0.95, 0.9, 0.5, 0.1, 0.05, 0.025, 0.01, 0.005
  // We want the UPPER tail — P(X > statistic). The table stores critical values
  // where P(X > cv) = alpha. So if statistic > table[df][0.005], p < 0.005.

  // Available table keys: 1-30, 40, 50, 60, 70, 80, 90, 100.
  // For df > 30, round down to the nearest 10; cap at 100.
  let dfKey: number;
  if (df <= 30) {
    dfKey = df;
  } else if (df > 100) {
    dfKey = 100;
  } else {
    dfKey = Math.floor(df / 10) * 10;
  }
  const row = (table as Record<number, (typeof table)[1]>)[dfKey];
  if (!row) return '>= 0.05';

  if (statistic > (row[0.005] ?? Infinity)) return '< 0.005';
  if (statistic > (row[0.01] ?? Infinity)) return '< 0.01';
  if (statistic > (row[0.05] ?? Infinity)) return '< 0.05';
  return '>= 0.05';
}

/** Convert p-bracket string to a boolean for significance at 0.05 level */
export function isSignificant(pBracket: string): boolean {
  return pBracket !== '>= 0.05';
}

/** Convert p-bracket to a representative numeric value for sorting */
export function pBracketToNumeric(pBracket: string): number {
  switch (pBracket) {
    case '< 0.005':
      return 0.0025;
    case '< 0.001':
      return 0.0005;
    case '< 0.01':
      return 0.005;
    case '< 0.05':
      return 0.025;
    default:
      return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Chi-Square Independence Test
// ---------------------------------------------------------------------------

export function chiSquareIndependence(observed: number[][]): {
  chiSq: number;
  df: number;
} {
  const rows = observed.length;
  const cols = observed[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return { chiSq: 0, df: 0 };

  // Guard against ragged arrays — all rows must have the same length
  for (let i = 1; i < rows; i++) {
    if (observed[i].length !== cols) return { chiSq: 0, df: 0 };
  }

  const rowSums = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = observed[0].map((_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0),
  );
  const total = rowSums.reduce((a, b) => a + b, 0);
  if (total === 0) return { chiSq: 0, df: 0 };

  let chiSq = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const expected = (rowSums[i] * colSums[j]) / total;
      if (expected > 0) {
        chiSq += Math.pow(observed[i][j] - expected, 2) / expected;
      }
    }
  }
  return { chiSq, df: (rows - 1) * (cols - 1) };
}

// ---------------------------------------------------------------------------
// Cramer's V Effect Size
// ---------------------------------------------------------------------------

export function cramersV(
  chiSq: number,
  n: number,
  k: number,
  r: number,
): number {
  if (n === 0 || Math.min(k, r) <= 1) return 0;
  return Math.sqrt(chiSq / (n * (Math.min(k, r) - 1)));
}

export function effectSizeLabel(
  v: number,
): 'negligible' | 'small' | 'medium' | 'large' {
  if (v < 0.1) return 'negligible';
  if (v < 0.3) return 'small';
  if (v < 0.5) return 'medium';
  return 'large';
}

// ---------------------------------------------------------------------------
// Correlation Functions
// ---------------------------------------------------------------------------

/** Spearman rank correlation: rank-transform both arrays, then Pearson */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0;
  const rankX = fractionalRanks(x);
  const rankY = fractionalRanks(y);
  const result = sampleCorrelation(rankX, rankY);
  return Number.isNaN(result) ? 0 : result;
}

/** Pearson correlation using simple-statistics */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0;
  const result = sampleCorrelation(x, y);
  return Number.isNaN(result) ? 0 : result;
}

/** Assign fractional ranks (average rank for ties) */
function fractionalRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j + 1) / 2; // 1-based average
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

/**
 * Approximate p-value bracket for correlation using t-distribution approximation.
 * t = r * sqrt((n-2) / (1-r^2)), df = n-2, then use chi-sq table approximation.
 * For large n (>30), t^2 ~ chi-sq(1), so we can reuse chi-sq table.
 */
export function correlationPBracket(r: number, n: number): string {
  if (n < 20) return '>= 0.05';
  const rSq = r * r;
  if (rSq >= 1) return '< 0.005';
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - rSq));
  // For two-tailed test, compare t^2 against chi-sq(1) critical values
  // (t^2 with df=n-2 ~ chi-sq(1) for large n; good approximation for n>20)
  const tSq = t * t;
  return pValueBracketFromChiSq(tSq, 1);
}

// ---------------------------------------------------------------------------
// Mann-Whitney U Test (2 independent groups)
// ---------------------------------------------------------------------------

export function mannWhitneyU(
  group1: number[],
  group2: number[],
): { U: number; pBracket: string } {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 === 0 || n2 === 0) return { U: 0, pBracket: '>= 0.05' };

  // Combine, rank, then sum ranks for group1
  const combined = [
    ...group1.map((v) => ({ v, group: 1 })),
    ...group2.map((v) => ({ v, group: 2 })),
  ];
  combined.sort((a, b) => a.v - b.v);

  // Assign fractional ranks
  const ranks = new Array<number>(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  let R1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 1) R1 += ranks[k];
  }

  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Normal approximation for p-value (valid for n1, n2 > 20)
  const meanU = (n1 * n2) / 2;
  const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (stdU === 0) return { U, pBracket: '>= 0.05' };

  const z = Math.abs((U1 - meanU) / stdU);
  // z^2 ~ chi-sq(1)
  const pBracket = pValueBracketFromChiSq(z * z, 1);

  return { U, pBracket };
}

// ---------------------------------------------------------------------------
// Kruskal-Wallis H Test (3+ independent groups)
// ---------------------------------------------------------------------------

export function kruskalWallis(
  groups: number[][],
): { H: number; pBracket: string } {
  const validGroups = groups.filter((g) => g.length > 0);
  if (validGroups.length < 2) return { H: 0, pBracket: '>= 0.05' };

  const N = validGroups.reduce((sum, g) => sum + g.length, 0);
  if (N === 0) return { H: 0, pBracket: '>= 0.05' };

  // Combine all values with group tags
  const combined: { v: number; groupIdx: number }[] = [];
  validGroups.forEach((g, gi) => {
    g.forEach((v) => combined.push({ v, groupIdx: gi }));
  });
  combined.sort((a, b) => a.v - b.v);

  // Assign fractional ranks
  const ranks = new Array<number>(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  // Sum of ranks per group
  const groupRankSums = new Array<number>(validGroups.length).fill(0);
  for (let k = 0; k < combined.length; k++) {
    groupRankSums[combined[k].groupIdx] += ranks[k];
  }

  // H statistic
  let H = 0;
  for (let g = 0; g < validGroups.length; g++) {
    const ni = validGroups[g].length;
    H += (groupRankSums[g] * groupRankSums[g]) / ni;
  }
  H = ((12 / (N * (N + 1))) * H) - (3 * (N + 1));

  const df = validGroups.length - 1;
  const pBracket = pValueBracketFromChiSq(H, df);

  return { H, pBracket };
}

// ---------------------------------------------------------------------------
// Wilson Score Confidence Interval
// ---------------------------------------------------------------------------

export function wilsonScoreInterval(
  successes: number,
  n: number,
  z = 1.96,
): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
}

// ---------------------------------------------------------------------------
// Linear Regression Forecast
// ---------------------------------------------------------------------------

export function linearRegressionForecast(
  dailyCounts: { day: number; count: number }[],
  currentN: number,
  nextThresholdN: number,
  nextThresholdLabel: string,
  referenceDate: Date = new Date(),
): EnrollmentForecast {
  if (dailyCounts.length < 2) {
    return {
      dailyRate: 0,
      currentN,
      nextThresholdN,
      nextThresholdLabel,
      projectedDate: null,
      interpretation:
        'Insufficient data for enrollment forecast (need at least 2 days of data).',
    };
  }

  const points = dailyCounts.map((d) => [d.day, d.count] as [number, number]);
  const { m: slope } = linearRegression(points);
  const dailyRate = Math.round(slope * 100) / 100;

  let projectedDate: string | null = null;
  let interpretation: string;

  if (dailyRate <= 0) {
    interpretation =
      'Registration rate is flat or declining — no projection available.';
  } else {
    const remaining = nextThresholdN - currentN;
    const daysNeeded = Math.ceil(remaining / dailyRate);
    const target = new Date(referenceDate);
    target.setDate(target.getDate() + daysNeeded);
    projectedDate = target.toISOString().split('T')[0];
    interpretation = `At the current rate of ~${dailyRate} registrations/day, the ${nextThresholdLabel} threshold (${nextThresholdN}) is projected to be reached around ${projectedDate}.`;
  }

  return {
    dailyRate,
    currentN,
    nextThresholdN,
    nextThresholdLabel,
    projectedDate,
    interpretation,
  };
}

// ---------------------------------------------------------------------------
// Interpretation Generator
// ---------------------------------------------------------------------------

export function generateChiSquareInterpretation(
  hypothesis: string,
  pBracket: string,
  cramersVValue: number,
  label: string,
): string {
  const sig = isSignificant(pBracket)
    ? 'a statistically significant'
    : 'no significant';
  return `There is ${sig} association between ${hypothesis} (p ${pBracket}, Cramer's V = ${cramersVValue.toFixed(2)} ${label} effect).`;
}

export function generateCorrelationInterpretation(
  hypothesis: string,
  coefficient: number,
  pBracket: string,
  method: 'spearman' | 'pearson',
): string {
  const sig = isSignificant(pBracket) ? 'significant' : 'not significant';
  const direction =
    coefficient > 0 ? 'positive' : coefficient < 0 ? 'negative' : 'no';
  return `There is a ${direction} ${method} correlation between ${hypothesis} (r = ${coefficient.toFixed(2)}, p ${pBracket}, ${sig}).`;
}

export function generateGroupComparisonInterpretation(
  hypothesis: string,
  method: 'mann-whitney' | 'kruskal-wallis',
  pBracket: string,
): string {
  const sig = isSignificant(pBracket)
    ? 'significantly different'
    : 'not significantly different';
  const testName =
    method === 'mann-whitney' ? 'Mann-Whitney U' : 'Kruskal-Wallis H';
  return `${hypothesis} are ${sig} (${testName} test, p ${pBracket}).`;
}

// ---------------------------------------------------------------------------
// P-value Bracket Display Helper
// ---------------------------------------------------------------------------

export function pValueBracket(p: number): string {
  if (p < 0.001) return '< 0.001';
  if (p < 0.01) return '< 0.01';
  if (p < 0.05) return '< 0.05';
  return '>= 0.05';
}

// ---------------------------------------------------------------------------
// High-level Test Runners (compose pure functions into result objects)
// ---------------------------------------------------------------------------

export function runChiSquareTest(
  hypothesis: string,
  observed: number[][],
): ChiSquareResult {
  const { chiSq, df } = chiSquareIndependence(observed);
  const n = observed.flat().reduce((a, b) => a + b, 0);
  const rows = observed.length;
  const cols = observed[0]?.length ?? 0;
  const v = cramersV(chiSq, n, cols, rows);
  const label = effectSizeLabel(v);
  const pBrk = pValueBracketFromChiSq(chiSq, df);
  const interpretation = generateChiSquareInterpretation(
    hypothesis,
    pBrk,
    v,
    label,
  );
  return {
    hypothesis,
    chiSq: Math.round(chiSq * 100) / 100,
    df,
    pValue: pBracketToNumeric(pBrk),
    pBracket: pBrk,
    cramersV: Math.round(v * 1000) / 1000,
    effectLabel: label,
    interpretation,
    significant: isSignificant(pBrk),
  };
}

export function runCorrelationTest(
  hypothesis: string,
  x: number[],
  y: number[],
  method: 'spearman' | 'pearson',
): CorrelationResult {
  const coefficient =
    method === 'spearman'
      ? spearmanCorrelation(x, y)
      : pearsonCorrelation(x, y);
  const pBrk = correlationPBracket(coefficient, x.length);
  const interpretation = generateCorrelationInterpretation(
    hypothesis,
    coefficient,
    pBrk,
    method,
  );
  return {
    hypothesis,
    coefficient: Math.round(coefficient * 1000) / 1000,
    pValue: pBracketToNumeric(pBrk),
    pBracket: pBrk,
    method,
    interpretation,
    significant: isSignificant(pBrk),
  };
}

export function runGroupComparisonTest(
  hypothesis: string,
  groups: Record<string, number[]>,
): GroupComparisonResult {
  const groupNames = Object.keys(groups);
  const groupArrays = Object.values(groups);

  let statistic: number;
  let pBrk: string;
  let method: 'mann-whitney' | 'kruskal-wallis';

  if (groupArrays.length === 2) {
    const result = mannWhitneyU(groupArrays[0], groupArrays[1]);
    statistic = result.U;
    pBrk = result.pBracket;
    method = 'mann-whitney';
  } else {
    const result = kruskalWallis(groupArrays);
    statistic = result.H;
    pBrk = result.pBracket;
    method = 'kruskal-wallis';
  }

  const groupMedians: Record<string, number> = {};
  for (const name of groupNames) {
    const arr = groups[name];
    groupMedians[name] = arr.length > 0 ? median(arr) : 0;
  }

  const interpretation = generateGroupComparisonInterpretation(
    hypothesis,
    method,
    pBrk,
  );

  return {
    hypothesis,
    statistic: Math.round(statistic * 100) / 100,
    pValue: pBracketToNumeric(pBrk),
    pBracket: pBrk,
    method,
    groupMedians,
    interpretation,
    significant: isSignificant(pBrk),
  };
}

export function runProportionCI(
  metric: string,
  successes: number,
  n: number,
): ProportionCI {
  const estimate = n > 0 ? successes / n : 0;
  const ci = wilsonScoreInterval(successes, n);
  const pct = (estimate * 100).toFixed(1);
  const lower = (ci.lower * 100).toFixed(1);
  const upper = (ci.upper * 100).toFixed(1);
  return {
    metric,
    estimate: Math.round(estimate * 10000) / 10000,
    ci95Lower: Math.round(ci.lower * 10000) / 10000,
    ci95Upper: Math.round(ci.upper * 10000) / 10000,
    n,
    interpretation: `${metric}: ${pct}% (95% CI: ${lower}% – ${upper}%, n = ${n})`,
  };
}
