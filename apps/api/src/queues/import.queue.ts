import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const importQueue = new Queue('staff-import', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 24 * 3600, // Keep for 24 hours
    },
  },
});
