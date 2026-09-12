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
        // Story 13-38 AC7 — buckets are the questionnaire's own values now.
        experienceLevel: '4_6',
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
    /**
     * [AI-Review][Medium] 2026-08-18 (re-review). The conflict SET used to write
     * `experienceLevel` unconditionally, so a RE-extraction whose answers cannot
     * be bucketed blanked a bucket the card was already rendering. This upsert
     * re-runs on every resubmission (submission-processing.service.ts:1344), and a
     * supplemental/self-edit submission need not carry `years_experience` at all.
     * Story 13-38 also NARROWED the accepted set (`senior`/`expert`/`mid`/… all
     * now normalise to null), so strictly MORE answers reach null than before.
     *
     * The INSERT half may still be null — a brand-new row has no stored bucket to
     * protect. It is only the UPDATE half that must never subtract.
     */
    it('never blanks a stored experience_level when the new answer is unbucketable', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-003',
          // 'senior' was accepted by the PRE-13-38 local table and is deliberately
          // rejected by the shared canon — the exact widened case.
          rawData: { skills_possessed: 'plumbing', years_experience: 'senior' },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-003', respondentId: 'resp-001' }));

      // A fresh row legitimately gets null...
      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        experienceLevel: null,
      }));

      // ...but the conflict path must NOT write null over what is already stored.
      const setArg = mocks.onConflictFn.mock.calls[0][0].set as Record<string, unknown>;
      expect(setArg.experienceLevel).not.toBeNull();
      expect(setArg.experienceLevel).toBeDefined();
      // It is a SQL fragment referencing the existing column, not a literal.
      expect(typeof setArg.experienceLevel).toBe('object');

      // business_name deliberately KEEPS the unconditional write: the live path
      // sees a whole submission, so dropping a trading name is a real retraction.
      expect(setArg.businessName).toBeNull();
    });

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
          experienceLevel: '7_10',
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

  describe('experience level normalization (Story 13-38 AC7)', () => {
    it.each([
      // The questionnaire's OWN five choice values (docs/questionnaire_schema.md:134-141).
      // Before 13-38, `less_1` and `over_10` normalised to NULL and `7_10`
      // collapsed into `4-7` — two of five real answers lost their hero stat.
      ['less_1', 'less_1'],
      ['1_3', '1_3'],
      ['4_6', '4_6'],
      ['7_10', '7_10'],
      ['over_10', 'over_10'],
      // Their labels, in case a channel submits the label instead of the value.
      ['Less than 1 year', 'less_1'],
      ['1-3 years', '1_3'],
      ['4-6 years', '4_6'],
      ['7-10 years', '7_10'],
      ['Over 10 years', 'over_10'],
      // A bare year count, placed on the questionnaire's own bucket edges.
      ['0', 'less_1'],
      ['3', '1_3'],
      ['5', '4_6'],
      ['10', '7_10'],
      ['20', 'over_10'],
      // Unambiguous "not started yet" synonyms.
      ['beginner', 'less_1'],
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

    it('stores NULL rather than guessing when the answer cannot be bucketed', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: 'test', years_experience: 'quite a while' },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        experienceLevel: null,
      }));
    });
  });

  describe('business name extraction (Story 13-38 AC8)', () => {
    it('stores a volunteered business_name, trimmed', async () => {
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: 'tailoring', business_name: '  Ade Tailoring Ventures  ' },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        businessName: 'Ade Tailoring Ventures',
      }));
    });

    it('caps a signboard-length business_name at 80 chars (AC8.3)', async () => {
      const long = 'A'.repeat(200);
      const mocks = setupDbMocks({
        submission: {
          id: 'sub-001',
          rawData: { skills_possessed: 'tailoring', business_name: long },
        },
        respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      const values = mocks.valuesFn.mock.calls[0][0] as { businessName: string };
      expect(values.businessName).toHaveLength(80);
    });

    it.each([
      ['absent', {}],
      ['blank', { business_name: '   ' }],
      ['non-string', { business_name: 42 }],
    ])(
      'stores NULL and NEVER a person\'s name when business_name is %s (AC8.2)',
      async (_case, businessFields) => {
        const mocks = setupDbMocks({
          submission: {
            id: 'sub-001',
            rawData: {
              skills_possessed: 'tailoring',
              // The person's identity IS in raw_data. A fallback chain that reached
              // for it would print a real name on a card the consent copy promises
              // is anonymous — this asserts no such chain exists.
              firstname: 'Adekemi',
              surname: 'Ogunlade',
              full_name: 'Adekemi Ogunlade',
              ...businessFields,
            },
          },
          respondent: { id: 'resp-001', consentMarketplace: true, consentEnriched: false, lgaId: null },
          fraudDetections: [],
        });

        await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

        const values = mocks.valuesFn.mock.calls[0][0] as { businessName: string | null };
        expect(values.businessName).toBeNull();
      },
    );
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

  // ── Story 13-58 — association provenance ────────────────────────────────
  //
  // The worker is the go-forward write path for
  // `marketplace_profiles.association_name` (the 13-38 card backfill is the other).
  // Layer 1 of four: the name must be on the profile before any imported respondent
  // is extracted, or those rows materialise badge-less and need a second production
  // backfill over live rows.
  //
  // ⚠️ [AI-Review][High] 2026-09-08 — this comment used to say the 8,278 materialise
  // "the instant extraction runs for them" once `PIPELINE_EXCLUDED_STATUSES` opens.
  // That is NOT what the code does, and the claim was repeated in four places. The
  // import path never enqueues this worker (`import.service.ts` holds no reference
  // to the queue; the worker's own note at :206-210 says the primary gate is
  // by-construction), and the only production enqueue is
  // `submission-processing.service.ts:1349-1353`, which the importer does not call.
  // Opening the status gate alone therefore creates ZERO profiles. See the story's
  // R7.
  //
  // ⚠️ Cohort coverage: every test in this block seeds `status: 'active'`. The
  // cohort is `imported_unverified`, which returns at the gate before the
  // derivation is ever reached — that case is pinned in
  // `marketplace-extraction.worker.gate-open.test.ts`.
  describe('association provenance (Story 13-58)', () => {
    it('carries respondents.metadata.association_name onto the profile', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'farming' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: { association_name: 'AFAN' },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: 'AFAN',
      }));
    });

    it('writes null when the respondent carries no association_name', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: { normalisation_warnings: ['phone_reformatted'] },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: null,
      }));
    });

    it('writes null when metadata is absent entirely', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'welding' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: null,
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: null,
      }));
    });

    /**
     * AC4 AS CORRECTED (2026-09-07). This is the case the ORIGINAL AC4 excluded and
     * the reason it was rewritten: the AFAN import MATCHED eleven people who had
     * already registered themselves, so `source = 'public'` while a named association
     * genuinely vouched for them. A worker that filtered on `source` would drop
     * exactly these eleven — the ruling silently unimplemented.
     *
     * RED-verify note: the sibling test above ("writes null when the respondent
     * carries no association_name") is what makes this one discriminating. Without
     * it, a worker that wrote null unconditionally would also pass "no badge for
     * ordinary public rows".
     */
    it('carries the name for a source=public respondent the import MATCHED', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'farming' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          source: 'public',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: {
            association_name: 'AFAN',
            association_vouched_by_batch_id: '01a072ae-0000-7000-8000-000000000000',
          },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: 'AFAN',
      }));
    });

    /**
     * A whitespace-only name asserts a vouch while naming nobody — an em-dash badge
     * with no body in front of it is precisely the overstatement R1 locks against.
     * Blank and absent must be the same thing: no badge.
     */
    it('normalises a whitespace-only association_name to null', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'farming' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: { association_name: '   ' },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: null,
      }));
    });

    it('trims a padded association_name', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'tiling' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: { association_name: '  ASNAT  ' },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      expect(mocks.valuesFn).toHaveBeenCalledWith(expect.objectContaining({
        associationName: 'ASNAT',
      }));
    });

    /**
     * ADD-or-CORRECT, never subtract — the same rule the `experienceLevel` review fix
     * established. A re-extraction (any resubmission re-runs this upsert) whose
     * respondent metadata no longer resolves a name must NOT blank a stored vouch:
     * the association made its claim once, and a later submission that simply says
     * nothing about it is not a retraction.
     */
    it('does not blank a stored vouch on re-extraction when the name is absent', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'farming' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: {},
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      const conflictArg = mocks.onConflictFn.mock.calls[0][0] as { set: Record<string, unknown> };
      // Not null — the SET must carry the column value back (a SQL self-reference),
      // exactly as `experienceLevel` does.
      expect(conflictArg.set.associationName).not.toBeNull();
      expect(conflictArg.set.associationName).toBeDefined();
    });

    it('CORRECTS a stored vouch when the respondent now resolves a name', async () => {
      const mocks = setupDbMocks({
        submission: { id: 'sub-001', rawData: { skills_possessed: 'farming' } },
        respondent: {
          id: 'resp-001',
          status: 'active',
          consentMarketplace: true,
          consentEnriched: false,
          lgaId: null,
          metadata: { association_name: 'AFAN' },
        },
        fraudDetections: [],
      });

      await processorFn(makeJob({ submissionId: 'sub-001', respondentId: 'resp-001' }));

      const conflictArg = mocks.onConflictFn.mock.calls[0][0] as { set: Record<string, unknown> };
      expect(conflictArg.set.associationName).toBe('AFAN');
    });
  });
});
