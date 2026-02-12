import Dexie, { type EntityTable } from 'dexie';

export interface Draft {
  id: string; // UUIDv7 (client-generated)
  formId: string; // References form schema
  formVersion: string; // Semver version string when draft was started
  responses: Record<string, unknown>; // Question answers
  questionPosition: number; // Current question index for resume
  status: 'in-progress' | 'completed' | 'submitted';
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface SubmissionQueueItem {
  id: string; // UUIDv7 (same as draft ID, becomes submission ID)
  formId: string;
  payload: Record<string, unknown>; // Full submission payload
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  retryCount: number;
  lastAttempt: string | null; // ISO timestamp
  createdAt: string;
  error: string | null; // Last error message
}

export interface CachedFormSchema {
  formId: string; // Primary key
  version: string;
  schema: Record<string, unknown>; // Full JSONB schema
  cachedAt: string; // ISO timestamp
  etag: string | null; // For cache validation
}

const db = new Dexie('oslrs-offline') as Dexie & {
  drafts: EntityTable<Draft, 'id'>;
  submissionQueue: EntityTable<SubmissionQueueItem, 'id'>;
  formSchemaCache: EntityTable<CachedFormSchema, 'formId'>;
};

db.version(1).stores({
  drafts: 'id, formId, status, updatedAt, [formId+status]',
  submissionQueue: 'id, formId, status, createdAt, [status+createdAt]',
  formSchemaCache: 'formId, cachedAt',
});

export { db };
