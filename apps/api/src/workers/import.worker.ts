import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { StaffService } from '../services/staff.service.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const importWorker = new Worker(
  'staff-import',
  async (job: Job) => {
    const { rows, actorId } = job.data;
    
    const results = {
      total: rows.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as any[],
    };

    await job.updateProgress(0);

    for (const [index, row] of rows.entries()) {
      try {
        await StaffService.processImportRow(row, actorId);
        results.succeeded++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          row: index + 1,
          error: err.message,
          data: row,
        });
      }
      results.processed++;
      
      // Update progress periodically
      if (results.processed % 5 === 0 || results.processed === results.total) {
         await job.updateProgress(Math.round((results.processed / results.total) * 100));
      }
    }

    return results;
  },
  {
    connection,
    concurrency: 2, 
  }
);

importWorker.on('completed', (job) => {
  console.info(`Import job ${job.id} completed`);
});

importWorker.on('failed', (job, err) => {
  console.error(`Import job ${job?.id} failed: ${err.message}`);
});
