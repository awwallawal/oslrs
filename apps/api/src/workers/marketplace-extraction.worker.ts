/**
 * Marketplace Extraction Worker
 *
 * BullMQ worker that extracts anonymous marketplace profiles from survey submissions.
 * Fires after submission processing when consent_marketplace is true.
 *
 * Created in Story 7.1, design source: prep-4 spike.
 * Follows fraud-detection.worker.ts pattern.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { eq, and } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { submissions, respondents, marketplaceProfiles, fraudDetections } from '../db/schema/index.js';
import { lgas } from '../db/schema/lgas.js';
import type { MarketplaceExtractionJobData } from '../queues/marketplace-extraction.queue.js';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

const logger = pino({ name: 'marketplace-extraction-worker' });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// ============================================================================
// Field Extraction Helpers
// ============================================================================

/** Canonical experience levels for consistent filtering */
const EXPERIENCE_LEVELS = ['entry', '1-3', '4-7', '8-15', '15+'] as const;
type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];

/** Maps raw form values to canonical experience levels */
function normalizeExperienceLevel(raw: string | undefined | null): ExperienceLevel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Direct canonical match
  if ((EXPERIENCE_LEVELS as readonly string[]).includes(lower)) return lower as ExperienceLevel;

  // Numeric extraction fallback
  const years = parseInt(lower, 10);
  if (!isNaN(years)) {
    if (years < 1) return 'entry';
    if (years <= 3) return '1-3';
    if (years <= 7) return '4-7';
    if (years <= 15) return '8-15';
    return '15+';
  }

  // Common label variants
  const labelMap: Record<string, ExperienceLevel> = {
    'none': 'entry', 'no experience': 'entry', 'beginner': 'entry', 'fresher': 'entry',
    '1-3 years': '1-3', '1 to 3': '1-3', 'junior': '1-3',
    '4-7 years': '4-7', '4 to 7': '4-7', 'mid': '4-7', 'intermediate': '4-7',
    '8-15 years': '8-15', '8 to 15': '8-15', 'senior': '8-15',
    '15+ years': '15+', 'over 15': '15+', 'expert': '15+',
  };
  const mapped = labelMap[lower];
  if (!mapped) {
    logger.warn({ event: 'marketplace_extraction.unrecognized_experience', raw });
  }
  return mapped ?? null;
}

/**
 * Extract skills and profession from rawData.
 * skills_possessed is a XLSForm select_multiple stored as space-delimited string.
 * Canonical split pattern: String(rawValue).split(' ').filter(Boolean)
 */
function extractSkills(rawData: Record<string, unknown>): { profession: string; skills: string } {
  // Try primary field first, then fallbacks
  // Use || (not ??) so empty strings also trigger fallback
  const skillsValue = rawData['skills_possessed'] || rawData['skill'] || rawData['profession'] || rawData['trade'];

  if (!skillsValue) {
    return { profession: '', skills: '' };
  }

  if (skillsValue !== rawData['skills_possessed']) {
    logger.warn({
      event: 'marketplace_extraction.skills_fallback_used',
      usedField: rawData['skill'] ? 'skill' : rawData['profession'] ? 'profession' : 'trade',
    });
  }

  const skillsStr = String(skillsValue);
  const skillsList = skillsStr.split(' ').map(s => s.trim()).filter(Boolean);

  return {
    profession: skillsList[0] || '',
    skills: skillsList.join(', '),
  };
}

/**
 * Get raw experience value from rawData with fallback variants.
 */
function getExperienceRaw(rawData: Record<string, unknown>): string | undefined {
  const value = rawData['years_experience'] ?? rawData['experience'] ?? rawData['exp_years'] ?? rawData['experience_level'];
  if (value == null) return undefined;
  if (value !== rawData['years_experience']) {
    logger.warn({
      event: 'marketplace_extraction.experience_fallback_used',
      usedField: rawData['experience'] ? 'experience' : rawData['exp_years'] ? 'exp_years' : 'experience_level',
    });
  }
  return String(value);
}

/**
 * Derive verified badge: true if respondent has at least one submission
 * with fraud_detections.assessor_resolution = 'final_approved'.
 */
async function deriveVerifiedBadge(respondentId: string): Promise<boolean> {
  const result = await db
    .select({ submissionId: fraudDetections.submissionId })
    .from(fraudDetections)
    .innerJoin(submissions, eq(fraudDetections.submissionId, submissions.id))
    .where(
      and(
        eq(submissions.respondentId, respondentId),
        eq(fraudDetections.assessorResolution, 'final_approved'),
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Resolve LGA name from LGA code/id via the lgas table.
 * Returns null if lgaId is not found (graceful degradation).
 */
async function resolveLgaName(lgaId: string | null): Promise<{ lgaId: string | null; lgaName: string | null }> {
  if (!lgaId) return { lgaId: null, lgaName: null };

  // Try matching by code first (most common), then by id
  const lga = await db.query.lgas.findFirst({
    where: eq(lgas.code, lgaId),
    columns: { name: true, code: true },
  });

  if (lga) {
    return { lgaId: lga.code, lgaName: lga.name };
  }

  // LGA code not found — profile still created, just unfiltered by LGA
  logger.warn({
    event: 'marketplace_extraction.lga_not_found',
    lgaId,
  });
  return { lgaId: null, lgaName: null };
}

// ============================================================================
// Worker
// ============================================================================

interface WorkerResult {
  action: 'extracted' | 'skipped' | 'error';
  respondentId: string;
  reason?: string;
}

export const marketplaceExtractionWorker = new Worker<MarketplaceExtractionJobData, WorkerResult>(
  'marketplace-extraction',
  async (job: Job<MarketplaceExtractionJobData>) => {
    const { submissionId, respondentId } = job.data;

    logger.info({
      event: 'marketplace_extraction.processing',
      jobId: job.id,
      submissionId,
      respondentId,
    });

    // 1. Load submission
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: { id: true, rawData: true },
    });

    if (!submission) {
      // Permanent error — don't retry
      logger.error({
        event: 'marketplace_extraction.submission_not_found',
        submissionId,
      });
      return { action: 'error', respondentId, reason: 'submission_not_found' };
    }

    // 2. Load respondent
    const respondent = await db.query.respondents.findFirst({
      where: eq(respondents.id, respondentId),
      columns: { id: true, consentMarketplace: true, consentEnriched: true, lgaId: true },
    });

    if (!respondent) {
      // Permanent error — don't retry
      logger.error({
        event: 'marketplace_extraction.respondent_not_found',
        respondentId,
      });
      return { action: 'error', respondentId, reason: 'respondent_not_found' };
    }

    // 3. Consent gate
    if (!respondent.consentMarketplace) {
      logger.info({
        event: 'marketplace_extraction.no_consent',
        respondentId,
      });
      return { action: 'skipped', respondentId, reason: 'no_consent' };
    }

    // 4. Extract fields from rawData
    const rawData = (submission.rawData as Record<string, unknown>) || {};
    const { profession, skills } = extractSkills(rawData);
    const experienceLevel = normalizeExperienceLevel(getExperienceRaw(rawData));

    // 5. Resolve LGA name
    const { lgaId: resolvedLgaId, lgaName } = await resolveLgaName(respondent.lgaId);

    // 6. Derive verified badge
    const verifiedBadge = await deriveVerifiedBadge(respondentId);

    // 7. UPSERT into marketplace_profiles
    // onConflictDoUpdate handles the case where a profile already exists for this respondent.
    // Currently unreachable via normal pipeline (NIN dedup rejects duplicate submissions),
    // but kept as defensive guard for future pipeline changes (e.g., relaxed NIN policy).
    await db
      .insert(marketplaceProfiles)
      .values({
        id: uuidv7(),
        respondentId,
        profession: profession || null,
        skills: skills || null,
        lgaId: resolvedLgaId,
        lgaName,
        experienceLevel,
        verifiedBadge,
        consentEnriched: respondent.consentEnriched,
      })
      .onConflictDoUpdate({
        target: marketplaceProfiles.respondentId,
        set: {
          profession: profession || null,
          skills: skills || null,
          lgaId: resolvedLgaId,
          lgaName,
          experienceLevel,
          consentEnriched: respondent.consentEnriched,
          verifiedBadge,
          updatedAt: sql`now()`,
        },
      });

    logger.info({
      event: 'marketplace_extraction.completed',
      jobId: job.id,
      respondentId,
      profession,
      verifiedBadge,
    });

    return { action: 'extracted', respondentId };
  },
  {
    connection,
    concurrency: 4,
  }
);

// Worker event handlers
marketplaceExtractionWorker.on('completed', (job, result) => {
  logger.debug({
    event: 'marketplace_extraction.job_completed',
    jobId: job.id,
    respondentId: result.respondentId,
    action: result.action,
  });
});

marketplaceExtractionWorker.on('failed', (job, error) => {
  logger.error({
    event: 'marketplace_extraction.job_failed',
    jobId: job?.id,
    respondentId: job?.data.respondentId,
    error: error.message,
    attempt: job?.attemptsMade,
  });
});

marketplaceExtractionWorker.on('error', (error) => {
  logger.error({
    event: 'marketplace_extraction.worker_error',
    error: error.message,
  });
});

logger.info({ event: 'marketplace_extraction.worker_started' });

export default marketplaceExtractionWorker;
