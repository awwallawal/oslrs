/**
 * Marketplace Extraction Queue
 *
 * BullMQ queue for extracting anonymous marketplace profiles from processed submissions.
 * Created in Story 7.1 — follows fraud-detection.queue.ts pattern.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'marketplace-extraction-queue' });

export interface MarketplaceExtractionJobData {
  respondentId: string;
  submissionId: string;
}

let marketplaceExtractionQueue: Queue<MarketplaceExtractionJobData> | null = null;

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
};

/**
 * Get or create the marketplace extraction queue
 */
export function getMarketplaceExtractionQueue(): Queue<MarketplaceExtractionJobData> {
  if (!marketplaceExtractionQueue) {
    const connection = createRedisConnection();

    marketplaceExtractionQueue = new Queue<MarketplaceExtractionJobData>('marketplace-extraction', {
      connection,
      defaultJobOptions,
    });

    logger.info({ event: 'queue.marketplace_extraction.created' });
  }

  return marketplaceExtractionQueue;
}

/**
 * Canonical BullMQ jobId for a respondent's marketplace-extraction job. Exported
 * (Story 13-27 review L1) so the backfill can probe for an in-flight duplicate
 * via the SAME key this producer uses — no format drift between the two.
 * Dedup key uses respondentId (not submissionId) — because UPSERT means only the
 * latest matters per respondent.
 */
export const marketplaceExtractionJobId = (respondentId: string): string =>
  `marketplace-${respondentId}`;

/**
 * Queue a submission for marketplace profile extraction.
 *
 * BullMQ 5 note (Story 13-27 review L1): `queue.add` with an already-present
 * jobId does NOT throw — it silently returns the existing job. So the legacy
 * `'Job already exists'` catch below is a defensive relic that effectively never
 * fires on this version; callers must not rely on a `null` return to detect a
 * duplicate. Idempotency for re-queues is guaranteed by the worker's UPSERT on
 * respondent_id, not by this return value.
 */
export async function queueMarketplaceExtraction(
  data: MarketplaceExtractionJobData
): Promise<string | null> {
  const queue = getMarketplaceExtractionQueue();

  const jobId = marketplaceExtractionJobId(data.respondentId);

  try {
    const job = await queue.add('marketplace-extraction', data, { jobId });

    logger.debug({
      event: 'queue.marketplace_extraction.added',
      jobId: job.id,
      respondentId: data.respondentId,
      submissionId: data.submissionId,
    });

    return job.id!;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Job already exists')) {
      logger.debug({
        event: 'queue.marketplace_extraction.deduplicated',
        respondentId: data.respondentId,
      });
      return null;
    }
    throw error;
  }
}

/**
 * Close the marketplace extraction queue connection
 */
export async function closeMarketplaceExtractionQueue(): Promise<void> {
  if (marketplaceExtractionQueue) {
    await marketplaceExtractionQueue.close();
    marketplaceExtractionQueue = null;
  }
}
