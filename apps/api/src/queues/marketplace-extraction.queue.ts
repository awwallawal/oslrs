/**
 * Marketplace Extraction Queue
 *
 * BullMQ queue for extracting anonymous marketplace profiles from processed submissions.
 * Created in Story 7.1 — follows fraud-detection.queue.ts pattern.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
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
    const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    marketplaceExtractionQueue = new Queue<MarketplaceExtractionJobData>('marketplace-extraction', {
      connection,
      defaultJobOptions,
    });

    logger.info({ event: 'queue.marketplace_extraction.created' });
  }

  return marketplaceExtractionQueue;
}

/**
 * Queue a submission for marketplace profile extraction.
 * Dedup key uses respondentId (not submissionId) — because UPSERT means only the latest matters per respondent.
 */
export async function queueMarketplaceExtraction(
  data: MarketplaceExtractionJobData
): Promise<string | null> {
  const queue = getMarketplaceExtractionQueue();

  const jobId = `marketplace-${data.respondentId}`;

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
