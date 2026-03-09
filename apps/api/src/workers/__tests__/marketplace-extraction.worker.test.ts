import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock('bullmq', () => {
  return {
    Worker: class MockWorker {
      constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
        capturedProcessor = processor;
      }
      on() { return this; }
      isRunning() { return true; }
      close() { return Promise.resolve(); }
    },
    Job: class MockJob {},
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      constructor() { /* no-op */ }
    },
  };
});

// Mock uuidv7
vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7',
}));

// Mock DB
const mockFindFirstSubmission = vi.fn();
const mockFindFirstRespondent = vi.fn();
const mockFindFirstLga = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      submissions: { findFirst: (...args: unknown[]) => mockFindFirstSubmission(...args) },
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
      lgas: { findFirst: (...args: unknown[]) => mockFindFirstLga(...args) },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

// Trigger module load to capture processor
await import('../marketplace-extraction.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

// ── Test Helpers ──────────────────────────────────────────────────────────

function makeJob(data: { submissionId: string; respondentId: string }) {
  return { id: 'job-001', data };
}

function setupDbMocks(opts: {
  submission?: Record<string, unknown> | null;
  respondent?: Record<string, unknown> | null;
  lga?: Record<string, unknown> | null;
  fraudDetections?: unknown[];
}) {
  mockFindFirstSubmission.mockResolvedValue(opts.submission ?? null);
  mockFindFirstRespondent.mockResolvedValue(opts.respondent ?? null);
  mockFindFirstLga.mockResolvedValue(opts.lga ?? null);

  // Mock the fraud detection query (db.select().from().innerJoin().where().limit())
  const limitFn = vi.fn().mockResolvedValue(opts.fraudDetections ?? []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
  const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
  mockSelect.mockReturnValue({ from: fromFn });

  // Mock the insert (db.insert().values().onConflictDoUpdate())
  const onConflictFn = vi.fn().mockResolvedValue(undefined);
  const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictFn });
  mockInsert.mockReturnValue({ values: valuesFn });

  return { limitFn, whereFn, innerJoinFn, fromFn, onConflictFn, valuesFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('marketplace-extraction worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('happy path', () => {
    it('should extract profile when consent is given', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: {
            skills_possessed: 'carpentry plumbing',
            years_experience: '4',
          },
        },
        respondent: {
          id: 'resp-001',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: 'ibadan-north',
        },
        lga: { name: 'Ibadan North', code: 'ibadan-north' },
        fraudDetections: [],
      });

      const result = await processorFn(makeJob({
        submissionId: 'sub-001',
        respondentId: 'resp-001',
      })) as Record<string, unknown>;

      expect(result.action).toBe('extracted');
      expect(result.respondentId).toBe('resp-001');
      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        respondentId: 'resp-001',
        profession: 'carpentry',
        skills: 'carpentry, plumbing',
        lgaId: 'ibadan-north',
        lgaName: 'Ibadan North',
        experienceLevel: '4-7',
        verifiedBadge: false,
        consentEnriched: false,
      }));
    });
  });

  describe('consent gating', () => {
    it('should skip extraction when consentMarketplace is false', async () => {
      setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: {
          id: 'resp-001',
          consentMarketplace: false,
          consentEnriched: false,
          lgaId: 'ibadan-north',
        },
      });

      const result = await processorFn(makeJob({
        submissionId: 'sub-001',
        respondentId: 'resp-001',
      })) as Record<string, unknown>;

      expect(result.action).toBe('skipped');
      expect(result.reason).toBe('no_consent');
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('UPSERT idempotency', () => {
    it('should call onConflictDoUpdate for same respondent', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-002',
          rawData: { skills_possessed: 'plumbing', years_experience: '10' },
        },
        respondent: {
          id: 'resp-001',
          consentMarketplace: true,
          consentEnriched: true,
          lgaId: 'ibadan-south',
        },
        lga: { name: 'Ibadan South', code: 'ibadan-south' },
        fraudDetections: [],
      });

      await processorFn(makeJob({
        submissionId: 'sub-002',
        respondentId: 'resp-001',
      }));

      expect(mocks.onConflictFn).toHaveBeenCalledWith(expect.objectContaining({
        set: expect.objectContaining({
          profession: 'plumbing',
          skills: 'plumbing',
          lgaId: 'ibadan-south',
          lgaName: 'Ibadan South',
          experienceLevel: '8-15',
          consentEnriched: true,
        }),
      }));
    });
  });

  describe('field mapping variants', () => {
    it('should extract from skills_possessed (primary)', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'electrician' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'electrician',
        skills: 'electrician',
      }));
    });

    it('should fallback to skill field when skills_possessed is missing', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skill: 'tailoring' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'tailoring',
        skills: 'tailoring',
      }));
    });

    it('should fallback to profession field', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { profession: 'mechanic' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'mechanic',
        skills: 'mechanic',
      }));
    });

    it('should fallback to trade field when all others missing', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { trade: 'masonry' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'masonry',
        skills: 'masonry',
      }));
    });
  });

  describe('space-delimited skills handling', () => {
    it('should split space-delimited skills_possessed into profession + skills', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: 'carpentry plumbing welding' },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'carpentry',
        skills: 'carpentry, plumbing, welding',
      }));
    });

    it('should handle single skill value', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'welding',
        skills: 'welding',
      }));
    });
  });

  describe('array-format skills (native form SelectMultipleInput)', () => {
    it('should handle skills_possessed as array of strings', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: ['carpentry', 'plumbing', 'welding'] },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'carpentry',
        skills: 'carpentry, plumbing, welding',
      }));
    });

    it('should handle single-element array', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: ['welding'] },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: 'welding',
        skills: 'welding',
      }));
    });
  });

  describe('bio and portfolio extraction from survey', () => {
    it('should extract bio_short and portfolio_url from rawData', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: {
            skills_possessed: ['carpentry'],
            bio_short: 'Experienced carpenter with 10 years of work',
            portfolio_url: 'https://example.com/portfolio',
          },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: true, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        bio: 'Experienced carpenter with 10 years of work',
        portfolioUrl: 'https://example.com/portfolio',
      }));
    });

    it('should set bio and portfolioUrl to null when not provided', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: ['welding'] },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        bio: null,
        portfolioUrl: null,
      }));
    });
  });

  describe('experience level normalization', () => {
    it.each([
      ['3', '1-3'],
      ['5', '4-7'],
      ['10', '8-15'],
      ['20', '15+'],
      ['0', 'entry'],
      ['entry', 'entry'],
      ['1-3', '1-3'],
      ['4-7 years', '4-7'],
      ['senior', '8-15'],
      ['expert', '15+'],
      ['beginner', 'entry'],
    ])('should normalize "%s" to "%s"', async (raw, expected) => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: 'test', years_experience: raw },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        experienceLevel: expected,
      }));
    });
  });

  describe('verified badge derivation', () => {
    it('should set verifiedBadge=true when respondent has final_approved assessment', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'plumbing' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [{ submissionId: 'sub-prev' }],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        verifiedBadge: true,
      }));
    });

    it('should set verifiedBadge=false when respondent has no assessment', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'plumbing' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        verifiedBadge: false,
      }));
    });
  });

  describe('error handling', () => {
    it('should return error action when submission not found (permanent error)', async () => {
      setupDbMocks({ submission: null });

      const result = await processorFn(makeJob({
        submissionId: 'sub-missing',
        respondentId: 'resp-001',
      })) as Record<string, unknown>;

      expect(result.action).toBe('error');
      expect(result.reason).toBe('submission_not_found');
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should return error action when respondent not found (permanent error)', async () => {
      setupDbMocks({
        submission: { id: 'sub-001', rawData: {} },
        respondent: null,
      });

      const result = await processorFn(makeJob({
        submissionId: 'sub-001',
        respondentId: 'resp-missing',
      })) as Record<string, unknown>;

      expect(result.action).toBe('error');
      expect(result.reason).toBe('respondent_not_found');
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should throw on transient DB errors (for BullMQ retry)', async () => {
      mockFindFirstSubmission.mockRejectedValue(new Error('Connection timeout'));

      await expect(
        processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }))
      ).rejects.toThrow('Connection timeout');
    });
  });

  describe('LGA resolution', () => {
    it('should resolve lgaName from lgas table', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: 'ibadan-north' },
        lga: { name: 'Ibadan North', code: 'ibadan-north' },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        lgaId: 'ibadan-north',
        lgaName: 'Ibadan North',
      }));
    });

    it('should set lgaId and lgaName to null when LGA code not found', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: 'unknown-lga' },
        lga: null,
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        lgaId: null,
        lgaName: null,
      }));
    });

    it('should handle null lgaId on respondent', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        lgaId: null,
        lgaName: null,
      }));
      expect(mockFindFirstLga).not.toHaveBeenCalled();
    });
  });

  describe('missing skills handling', () => {
    it('should set profession and skills to null when no skill fields exist', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { years_experience: '5' } },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        profession: null,
        skills: null,
      }));
    });
  });
});
