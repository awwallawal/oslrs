import { describe, it, expect } from 'vitest';
import {
  chiSquareIndependence,
  cramersV,
  effectSizeLabel,
  spearmanCorrelation,
  pearsonCorrelation,
  mannWhitneyU,
  kruskalWallis,
  wilsonScoreInterval,
  linearRegressionForecast,
  pValueBracket,
  pValueBracketFromChiSq,
  runChiSquareTest,
  runCorrelationTest,
  runGroupComparisonTest,
  runProportionCI,
  correlationPBracket,
  isSignificant,
  pBracketToNumeric,
  generateChiSquareInterpretation,
  generateCorrelationInterpretation,
  generateGroupComparisonInterpretation,
} from '../statistical-tests.service.js';

describe('StatisticalTestsService', () => {
  // Task 5.1: chi-square on known 2x2 contingency table
  describe('chiSquareIndependence', () => {
    it('returns expected statistic for known 2x2 table', () => {
      // [[10, 20], [20, 50]]: rowSums=[30,70], colSums=[30,70], total=100
      // Expected_{00} = 9, E_{01} = 21, E_{10} = 21, E_{11} = 49
      // Chi-sq = (10-9)²/9 + (20-21)²/21 + (20-21)²/21 + (50-49)²/49 ≈ 0.227
      const result = chiSquareIndependence([[10, 20], [20, 50]]);
      expect(result.df).toBe(1);
      expect(result.chiSq).toBeCloseTo(0.227, 2);
    });

    it('returns 0 for degenerate tables', () => {
      expect(chiSquareIndependence([[1]]).chiSq).toBe(0);
      expect(chiSquareIndependence([]).chiSq).toBe(0);
    });

    it('handles larger contingency tables', () => {
      // 3x3 table → df = (3-1)*(3-1) = 4
      const result = chiSquareIndependence([
        [50, 10, 5],
        [10, 30, 20],
        [5, 20, 40],
      ]);
      expect(result.df).toBe(4);
      expect(result.chiSq).toBeGreaterThan(0);
    });
  });

  // Task 5.2: Cramer's V
  describe('cramersV', () => {
    it('computes correct effect size for known chi-square result', () => {
      // V = sqrt(chiSq / (n * min(k-1, r-1)))
      // chiSq=25, n=100, k=3, r=2 → V = sqrt(25/(100*1)) = 0.5
      expect(cramersV(25, 100, 3, 2)).toBeCloseTo(0.5, 4);
    });

    it('returns 0 when n is 0', () => {
      expect(cramersV(10, 0, 3, 2)).toBe(0);
    });
  });

  // Task 5.9: effect size labels
  describe('effectSizeLabel', () => {
    it('maps to correct thresholds', () => {
      expect(effectSizeLabel(0.05)).toBe('negligible');
      expect(effectSizeLabel(0.1)).toBe('small');
      expect(effectSizeLabel(0.15)).toBe('small');
      expect(effectSizeLabel(0.3)).toBe('medium');
      expect(effectSizeLabel(0.45)).toBe('medium');
      expect(effectSizeLabel(0.5)).toBe('large');
      expect(effectSizeLabel(0.8)).toBe('large');
    });
  });

  // Task 5.3: Spearman on perfectly ranked data
  describe('spearmanCorrelation', () => {
    it('returns 1.0 for perfectly ranked data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 20, 30, 40, 50];
      expect(spearmanCorrelation(x, y)).toBeCloseTo(1.0, 4);
    });

    it('returns -1.0 for inversely ranked data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [50, 40, 30, 20, 10];
      expect(spearmanCorrelation(x, y)).toBeCloseTo(-1.0, 4);
    });

    it('returns 0 for too-short arrays', () => {
      expect(spearmanCorrelation([1], [2])).toBe(0);
    });
  });

  // Task 5.4: Pearson on perfectly linear data
  describe('pearsonCorrelation', () => {
    it('returns 1.0 for perfectly linear data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 4);
    });

    it('returns 0 for too-short arrays', () => {
      expect(pearsonCorrelation([1, 2], [3, 4])).toBe(0);
    });
  });

  // Task 5.5: Wilson score interval
  describe('wilsonScoreInterval', () => {
    it('contains true proportion for known input', () => {
      // 50 out of 100 → p=0.5, CI should contain 0.5
      const ci = wilsonScoreInterval(50, 100);
      expect(ci.lower).toBeLessThan(0.5);
      expect(ci.upper).toBeGreaterThan(0.5);
      expect(ci.lower).toBeGreaterThan(0.3);
      expect(ci.upper).toBeLessThan(0.7);
    });

    it('returns 0,0 for n=0', () => {
      const ci = wilsonScoreInterval(0, 0);
      expect(ci.lower).toBe(0);
      expect(ci.upper).toBe(0);
    });

    it('clamps to [0, 1]', () => {
      const ci = wilsonScoreInterval(1, 1);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeLessThanOrEqual(1);
    });
  });

  // Task 5.6: Mann-Whitney U on identical groups
  describe('mannWhitneyU', () => {
    it('returns non-significant for identical groups', () => {
      const group1 = Array.from({ length: 30 }, (_, i) => i + 1);
      const group2 = Array.from({ length: 30 }, (_, i) => i + 1);
      const result = mannWhitneyU(group1, group2);
      expect(result.pBracket).toBe('>= 0.05');
    });

    it('handles empty groups', () => {
      const result = mannWhitneyU([], [1, 2, 3]);
      expect(result.pBracket).toBe('>= 0.05');
    });

    it('returns significant for clearly separated groups', () => {
      const group1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const group2 = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
      const result = mannWhitneyU(group1, group2);
      expect(result.pBracket).not.toBe('>= 0.05');
      // U = min(U1, U2); for perfectly separated groups U = 0 (maximum separation)
      expect(result.U).toBeGreaterThanOrEqual(0);
    });
  });

  // Task 5.7: Kruskal-Wallis on distinct groups
  describe('kruskalWallis', () => {
    it('returns significant for clearly distinct groups', () => {
      const group1 = Array.from({ length: 30 }, (_, i) => 10 + i);
      const group2 = Array.from({ length: 30 }, (_, i) => 100 + i);
      const group3 = Array.from({ length: 30 }, (_, i) => 1000 + i);
      const result = kruskalWallis([group1, group2, group3]);
      expect(result.H).toBeGreaterThan(0);
      expect(result.pBracket).not.toBe('>= 0.05');
    });

    it('handles fewer than 2 groups', () => {
      const result = kruskalWallis([[1, 2, 3]]);
      expect(result.H).toBe(0);
    });
  });

  // Task 5.8: interpretation generator
  describe('interpretation generators', () => {
    it('produces correct sentence for chi-square significant', () => {
      const text = generateChiSquareInterpretation(
        'gender and employment',
        '< 0.05',
        0.25,
        'small',
      );
      expect(text).toContain('a statistically significant');
      expect(text).toContain('gender and employment');
      expect(text).toContain('0.25');
      expect(text).toContain('small effect');
    });

    it('produces correct sentence for chi-square non-significant', () => {
      const text = generateChiSquareInterpretation(
        'gender and housing',
        '>= 0.05',
        0.05,
        'negligible',
      );
      expect(text).toContain('no significant');
    });

    it('produces correct sentence for correlation', () => {
      const text = generateCorrelationInterpretation(
        'education and income',
        0.45,
        '< 0.01',
        'spearman',
      );
      expect(text).toContain('positive');
      expect(text).toContain('spearman');
      expect(text).toContain('significant');
    });

    it('produces correct sentence for group comparison', () => {
      const text = generateGroupComparisonInterpretation(
        'Monthly income across LGAs',
        'kruskal-wallis',
        '< 0.05',
      );
      expect(text).toContain('significantly different');
      expect(text).toContain('Kruskal-Wallis H');
    });
  });

  // Task 5.10: pValueBracket
  describe('pValueBracket', () => {
    it('returns correct bracket strings', () => {
      expect(pValueBracket(0.0001)).toBe('< 0.001');
      expect(pValueBracket(0.005)).toBe('< 0.01');
      expect(pValueBracket(0.03)).toBe('< 0.05');
      expect(pValueBracket(0.1)).toBe('>= 0.05');
      expect(pValueBracket(0.5)).toBe('>= 0.05');
    });
  });

  // Task 5.11: linearRegressionForecast
  describe('linearRegressionForecast', () => {
    it('returns positive slope for increasing data', () => {
      const dailyCounts = [
        { day: 0, count: 5 },
        { day: 1, count: 8 },
        { day: 2, count: 12 },
        { day: 3, count: 15 },
        { day: 4, count: 18 },
      ];
      const result = linearRegressionForecast(dailyCounts, 100, 500, 'Phase 5');
      expect(result.dailyRate).toBeGreaterThan(0);
      expect(result.projectedDate).not.toBeNull();
      expect(result.interpretation).toContain('Phase 5');
    });

    it('returns null projected date for zero/negative slope', () => {
      const dailyCounts = [
        { day: 0, count: 10 },
        { day: 1, count: 8 },
        { day: 2, count: 6 },
        { day: 3, count: 4 },
      ];
      const result = linearRegressionForecast(dailyCounts, 28, 500, 'Phase 5');
      expect(result.projectedDate).toBeNull();
      expect(result.interpretation).toContain('flat or declining');
    });

    it('handles insufficient data', () => {
      const result = linearRegressionForecast([{ day: 0, count: 5 }], 5, 100, 'Test');
      expect(result.dailyRate).toBe(0);
      expect(result.projectedDate).toBeNull();
    });
  });

  // runChiSquareTest integration
  describe('runChiSquareTest', () => {
    it('returns complete ChiSquareResult object', () => {
      const result = runChiSquareTest('test hypothesis', [
        [50, 10],
        [10, 30],
      ]);
      expect(result.hypothesis).toBe('test hypothesis');
      expect(result.df).toBe(1);
      expect(result.chiSq).toBeGreaterThan(0);
      expect(result.cramersV).toBeGreaterThanOrEqual(0);
      expect(['negligible', 'small', 'medium', 'large']).toContain(result.effectLabel);
      expect(result.interpretation).toBeTruthy();
      expect(typeof result.significant).toBe('boolean');
    });
  });

  describe('pValueBracketFromChiSq', () => {
    it('returns >= 0.05 for small statistic', () => {
      expect(pValueBracketFromChiSq(0.5, 1)).toBe('>= 0.05');
    });

    it('returns < 0.05 for moderate statistic with df=1', () => {
      // chi-sq critical value at 0.05 for df=1 is 3.841
      expect(pValueBracketFromChiSq(4.0, 1)).toBe('< 0.05');
    });

    it('returns < 0.005 for very large statistic', () => {
      expect(pValueBracketFromChiSq(20, 1)).toBe('< 0.005');
    });

    it('handles df=0', () => {
      expect(pValueBracketFromChiSq(10, 0)).toBe('>= 0.05');
    });
  });

  // Gap 7: correlationPBracket
  describe('correlationPBracket', () => {
    it('returns significant bracket for strong correlation with large n', () => {
      // r=0.9, n=30 → t = 0.9 * sqrt(28 / (1-0.81)) ≈ 10.9 → very significant
      const result = correlationPBracket(0.9, 30);
      expect(result).not.toBe('>= 0.05');
    });

    it('returns non-significant bracket for weak correlation with small n', () => {
      // r=0.1, n=10 → n < 20, early return
      const result = correlationPBracket(0.1, 10);
      expect(result).toBe('>= 0.05');
    });

    it('returns >= 0.05 when n < 20', () => {
      expect(correlationPBracket(0.95, 19)).toBe('>= 0.05');
      expect(correlationPBracket(0.5, 5)).toBe('>= 0.05');
    });
  });

  // Gap 7: runCorrelationTest
  describe('runCorrelationTest', () => {
    it('returns correct shape and fields for spearman', () => {
      const x = Array.from({ length: 30 }, (_, i) => i);
      const y = Array.from({ length: 30 }, (_, i) => i * 2 + 5);
      const result = runCorrelationTest('education vs income', x, y, 'spearman');
      expect(result.hypothesis).toBe('education vs income');
      expect(result.method).toBe('spearman');
      expect(typeof result.coefficient).toBe('number');
      expect(typeof result.pValue).toBe('number');
      expect(typeof result.pBracket).toBe('string');
      expect(typeof result.interpretation).toBe('string');
      expect(typeof result.significant).toBe('boolean');
    });

    it('returns correct shape and fields for pearson', () => {
      const x = Array.from({ length: 30 }, (_, i) => i);
      const y = Array.from({ length: 30 }, (_, i) => i * 3);
      const result = runCorrelationTest('age vs wage', x, y, 'pearson');
      expect(result.hypothesis).toBe('age vs wage');
      expect(result.method).toBe('pearson');
      expect(result.coefficient).toBeCloseTo(1.0, 2);
      expect(result.significant).toBe(true);
      expect(result.interpretation).toContain('pearson');
    });
  });

  // Gap 7: runGroupComparisonTest
  describe('runGroupComparisonTest', () => {
    it('returns mann-whitney result for 2 groups', () => {
      const groups = {
        low: Array.from({ length: 20 }, (_, i) => i),
        high: Array.from({ length: 20 }, (_, i) => i + 100),
      };
      const result = runGroupComparisonTest('income by education level', groups);
      expect(result.hypothesis).toBe('income by education level');
      expect(result.method).toBe('mann-whitney');
      expect(typeof result.statistic).toBe('number');
      expect(typeof result.pValue).toBe('number');
      expect(typeof result.pBracket).toBe('string');
      expect(typeof result.significant).toBe('boolean');
      expect(result.groupMedians).toHaveProperty('low');
      expect(result.groupMedians).toHaveProperty('high');
      expect(result.interpretation).toContain('Mann-Whitney U');
    });

    it('returns kruskal-wallis result for 3+ groups', () => {
      const groups = {
        groupA: Array.from({ length: 20 }, (_, i) => i),
        groupB: Array.from({ length: 20 }, (_, i) => i + 50),
        groupC: Array.from({ length: 20 }, (_, i) => i + 200),
      };
      const result = runGroupComparisonTest('wages across LGAs', groups);
      expect(result.hypothesis).toBe('wages across LGAs');
      expect(result.method).toBe('kruskal-wallis');
      expect(result.groupMedians).toHaveProperty('groupA');
      expect(result.groupMedians).toHaveProperty('groupB');
      expect(result.groupMedians).toHaveProperty('groupC');
      expect(result.interpretation).toContain('Kruskal-Wallis H');
    });
  });

  // Gap 7: runProportionCI
  describe('runProportionCI', () => {
    it('returns correct shape and percentage formatting', () => {
      const result = runProportionCI('Employment rate', 75, 100);
      expect(result.metric).toBe('Employment rate');
      expect(result.estimate).toBeCloseTo(0.75, 2);
      expect(result.ci95Lower).toBeLessThan(0.75);
      expect(result.ci95Upper).toBeGreaterThan(0.75);
      expect(result.n).toBe(100);
      expect(result.interpretation).toContain('Employment rate');
      expect(result.interpretation).toContain('75.0%');
      expect(result.interpretation).toContain('95% CI');
      expect(result.interpretation).toContain('n = 100');
    });

    it('handles zero n', () => {
      const result = runProportionCI('Zero metric', 0, 0);
      expect(result.estimate).toBe(0);
      expect(result.ci95Lower).toBe(0);
      expect(result.ci95Upper).toBe(0);
    });
  });

  // Gap 7: isSignificant
  describe('isSignificant', () => {
    it('returns true for all significant brackets', () => {
      expect(isSignificant('< 0.005')).toBe(true);
      expect(isSignificant('< 0.001')).toBe(true);
      expect(isSignificant('< 0.01')).toBe(true);
      expect(isSignificant('< 0.05')).toBe(true);
    });

    it('returns false for non-significant bracket', () => {
      expect(isSignificant('>= 0.05')).toBe(false);
    });
  });

  // Gap 7: pBracketToNumeric
  describe('pBracketToNumeric', () => {
    it('returns correct numeric values for all brackets', () => {
      expect(pBracketToNumeric('< 0.005')).toBe(0.0025);
      expect(pBracketToNumeric('< 0.001')).toBe(0.0005);
      expect(pBracketToNumeric('< 0.01')).toBe(0.005);
      expect(pBracketToNumeric('< 0.05')).toBe(0.025);
      expect(pBracketToNumeric('>= 0.05')).toBe(0.5);
    });

    it('returns 0.5 for unknown bracket strings', () => {
      expect(pBracketToNumeric('something else')).toBe(0.5);
    });
  });
});
