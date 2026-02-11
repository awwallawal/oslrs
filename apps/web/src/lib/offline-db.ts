// SPIKE: prep-5 — Dexie.js IndexedDB database for offline-first PWA
// Defines tables for drafts, submission queue, and form schema cache.
// Production version will be evolved in Stories 3.2/3.3.

import Dexie, { type EntityTable } from 'dexie';

// SPIKE: prep-5 — Draft record for in-progress survey responses
export interface Draft {
  id: string; // UUIDv7 (client-generated)
  formId: string; // References form schema
  formVersion: number; // Schema version when draft was started
  responses: Record<string, unknown>; // Question answers
  questionPosition: number; // Current question index for resume
  status: 'in-progress' | 'completed' | 'submitted';
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// SPIKE: prep-5 — Queued submission awaiting sync
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

// SPIKE: prep-5 — Cached form schema for offline rendering
export interface CachedFormSchema {
  formId: string; // Primary key
  version: number;
  schema: Record<string, unknown>; // Full JSONB schema
  cachedAt: string; // ISO timestamp
  etag: string | null; // For cache validation
}

// SPIKE: prep-5 — Dexie database with typed tables
const db = new Dexie('oslrs-offline') as Dexie & {
  drafts: EntityTable<Draft, 'id'>;
  submissionQueue: EntityTable<SubmissionQueueItem, 'id'>;
  formSchemaCache: EntityTable<CachedFormSchema, 'formId'>;
};

// SPIKE: prep-5 — Schema version 1: initial tables with indexes
db.version(1).stores({
  drafts: 'id, formId, status, updatedAt, [formId+status]',
  submissionQueue: 'id, formId, status, createdAt, [status+createdAt]',
  formSchemaCache: 'formId, cachedAt',
});

export { db };
