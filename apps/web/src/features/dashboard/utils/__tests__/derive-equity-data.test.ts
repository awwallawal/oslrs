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
});
