import { describe, it, expect } from 'vitest';
import type { DemographicStats, EmploymentStats, RegistrySummary } from '@oslsr/types';
import { deriveEquityData } from '../derive-equity-data';

const mockDemographics: DemographicStats = {
  genderDistribution: [
    { label: 'male', count: 100, percentage: 50 },
    { label: 'female', count: 95, percentage: 47.5 },
  ],
  ageDistribution: [],
  educationDistribution: [],
  maritalDistribution: [],
  disabilityPrevalence: [],
  lgaDistribution: [],
  consentMarketplace: [],
  consentEnriched: [],
};

const mockEmployment: EmploymentStats = {
  workStatusBreakdown: [],
  employmentTypeBreakdown: [],
  formalInformalRatio: [
    { label: 'formal', count: 40, percentage: 40 },
    { label: 'informal', count: 60, percentage: 60 },
  ],
  experienceDistribution: [],
  hoursWorked: [],
  incomeDistribution: [],
  incomeByLga: [],
};

const mockSummary: RegistrySummary = {
  totalRespondents: 200,
  employedCount: 120,
  employedPct: 60,
  femaleCount: 95,
  femalePct: 47.5,
  avgAge: 32,
  businessOwners: 40,
  businessOwnersPct: 20,
  consentMarketplacePct: 70,
  consentEnrichedPct: 55,
};

describe('deriveEquityData', () => {
  it('returns undefined when all sources are undefined', () => {
    expect(deriveEquityData(undefined, undefined, undefined)).toBeUndefined();
  });

  it('computes GPI from demographics genderDistribution', () => {
    const result = deriveEquityData(mockDemographics, undefined, undefined);
    expect(result).toBeDefined();
    expect(result!.gpiRatio).toBe(0.95);
    expect(result!.employmentRatePct).toBeNull();
    expect(result!.informalSectorPct).toBeNull();
  });

  it('extracts employmentRatePct from registrySummary', () => {
    const result = deriveEquityData(undefined, undefined, mockSummary);
    expect(result).toBeDefined();
    expect(result!.employmentRatePct).toBe(60);
    expect(result!.gpiRatio).toBeNull();
  });

  it('extracts informalSectorPct from employment', () => {
    const result = deriveEquityData(undefined, mockEmployment, undefined);
    expect(result).toBeDefined();
    expect(result!.informalSectorPct).toBe(60);
    expect(result!.gpiRatio).toBeNull();
  });

  it('computes all three fields when all data is available', () => {
    const result = deriveEquityData(mockDemographics, mockEmployment, mockSummary);
    expect(result).toEqual({
      gpiRatio: 0.95,
      employmentRatePct: 60,
      informalSectorPct: 60,
      // Story 12-5 AC4: each metric carries the base IT was computed over.
      denominators: {
        gpi: 195,             // the gender-answered buckets (100 + 95)
        employmentRate: 200,  // the answers subset the summary counts
        informalSector: 100,  // the formal/informal-answered buckets
      },
    });
  });

  // ── Story 12-5 AC4 — denominators ──────────────────────────────────────
  describe('denominators', () => {
    it('reports three different bases, never one collapsed number', () => {
      const result = deriveEquityData(mockDemographics, mockEmployment, mockSummary);
      const { gpi, employmentRate, informalSector } = result!.denominators;
      // If these ever collapse to one value, two of the three rates are being
      // presented with a weight they did not earn.
      expect(new Set([gpi, employmentRate, informalSector]).size).toBe(3);
    });

    it('leaves a denominator null when its metric is null', () => {
      const zeroDemographics: DemographicStats = {
        ...mockDemographics,
        genderDistribution: [
          { label: 'male', count: 0, percentage: 0 },
          { label: 'female', count: 95, percentage: 100 },
        ],
      };
      const result = deriveEquityData(zeroDemographics, undefined, undefined);
      expect(result!.gpiRatio).toBeNull();
      // No figure on screen, so no base for it either.
      expect(result!.denominators.gpi).toBeNull();
      expect(result!.denominators.informalSector).toBeNull();
    });

    it('excludes suppressed buckets from a denominator', () => {
      const suppressed: DemographicStats = {
        ...mockDemographics,
        genderDistribution: [
          { label: 'male', count: 100, percentage: 51.3 },
          { label: 'female', count: 95, percentage: 48.7 },
          { label: 'other', count: null, percentage: null, suppressed: true },
        ],
      };
      const result = deriveEquityData(suppressed, undefined, undefined);
      // The withheld bucket cannot be added to a base we publish.
      expect(result!.denominators.gpi).toBe(195);
    });
  });

  it('returns null GPI when male count is zero', () => {
    const zeroDemographics: DemographicStats = {
      ...mockDemographics,
      genderDistribution: [
        { label: 'male', count: 0, percentage: 0 },
        { label: 'female', count: 95, percentage: 100 },
      ],
    };
    const result = deriveEquityData(zeroDemographics, undefined, undefined);
    expect(result!.gpiRatio).toBeNull();
  });

  it('returns null GPI when gender buckets are suppressed', () => {
    const suppressedDemographics: DemographicStats = {
      ...mockDemographics,
      genderDistribution: [
        { label: 'male', count: null, percentage: null, suppressed: true },
        { label: 'female', count: null, percentage: null, suppressed: true },
      ],
    };
    const result = deriveEquityData(suppressedDemographics, undefined, undefined);
    expect(result!.gpiRatio).toBeNull();
  });

  it('returns null informalSectorPct when informal bucket is suppressed', () => {
    const suppressedEmployment: EmploymentStats = {
      ...mockEmployment,
      formalInformalRatio: [
        { label: 'formal', count: null, percentage: null, suppressed: true },
        { label: 'informal', count: null, percentage: null, suppressed: true },
      ],
    };
    const result = deriveEquityData(undefined, suppressedEmployment, undefined);
    expect(result!.informalSectorPct).toBeNull();
  });

  it('counts only the buckets the GPI is actually computed from', () => {
    // Review R10. GPI is female ÷ male. An "Other" bucket belongs to the
    // distribution but not to the ratio, so folding it into the published n
    // would state a base the metric never used — an n that is not the metric's
    // n, which is the defect this story exists to end.
    const result = deriveEquityData(
      {
        genderDistribution: [
          { label: 'female', count: 60, percentage: 40 },
          { label: 'male', count: 80, percentage: 53.3 },
          { label: 'other', count: 10, percentage: 6.7 },
        ],
      } as never,
      undefined,
      undefined,
    );
    expect(result?.denominators.gpi).toBe(140);
  });

});
