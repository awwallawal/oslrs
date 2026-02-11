// SPIKE: prep-5 — Unit tests for Dexie IndexedDB offline database
// Tests CRUD operations, schema validation, and compound index queries.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type Draft, type SubmissionQueueItem, type CachedFormSchema } from './offline-db';

describe('offline-db (Dexie IndexedDB)', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.drafts.clear();
    await db.submissionQueue.clear();
    await db.formSchemaCache.clear();
  });

  afterAll(async () => {
    // SPIKE: prep-5 — Close Dexie database to prevent interference with other test suites
    await db.delete();
  });

  describe('drafts table', () => {
    const sampleDraft: Draft = {
      id: '019473a1-0000-7000-8000-000000000001',
      formId: 'form-001',
      formVersion: 1,
      responses: { q1: 'answer1', q2: 42 },
      questionPosition: 2,
      status: 'in-progress',
      createdAt: '2026-02-11T10:00:00.000Z',
      updatedAt: '2026-02-11T10:05:00.000Z',
    };

    it('should create and read a draft', async () => {
      await db.drafts.add(sampleDraft);
      const retrieved = await db.drafts.get(sampleDraft.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.formId).toBe('form-001');
      expect(retrieved!.responses).toEqual({ q1: 'answer1', q2: 42 });
      expect(retrieved!.questionPosition).toBe(2);
    });

    it('should update a draft', async () => {
      await db.drafts.add(sampleDraft);

      await db.drafts.update(sampleDraft.id, {
        responses: { q1: 'answer1', q2: 42, q3: 'new' },
        questionPosition: 3,
        updatedAt: '2026-02-11T10:10:00.000Z',
      });

      const updated = await db.drafts.get(sampleDraft.id);
      expect(updated!.questionPosition).toBe(3);
      expect(updated!.responses).toEqual({ q1: 'answer1', q2: 42, q3: 'new' });
      expect(updated!.updatedAt).toBe('2026-02-11T10:10:00.000Z');
    });

    it('should delete a draft', async () => {
      await db.drafts.add(sampleDraft);
      await db.drafts.delete(sampleDraft.id);

      const deleted = await db.drafts.get(sampleDraft.id);
      expect(deleted).toBeUndefined();
    });

    it('should query drafts by formId using index', async () => {
      await db.drafts.bulkAdd([
        { ...sampleDraft, id: 'draft-1', formId: 'form-001' },
        { ...sampleDraft, id: 'draft-2', formId: 'form-002' },
        { ...sampleDraft, id: 'draft-3', formId: 'form-001' },
      ]);

      const form001Drafts = await db.drafts.where('formId').equals('form-001').toArray();
      expect(form001Drafts).toHaveLength(2);
    });

    it('should query drafts by compound index [formId+status]', async () => {
      await db.drafts.bulkAdd([
        { ...sampleDraft, id: 'draft-1', formId: 'form-001', status: 'in-progress' },
        { ...sampleDraft, id: 'draft-2', formId: 'form-001', status: 'completed' },
        { ...sampleDraft, id: 'draft-3', formId: 'form-002', status: 'in-progress' },
      ]);

      const inProgressForm001 = await db.drafts
        .where('[formId+status]')
        .equals(['form-001', 'in-progress'])
        .toArray();

      expect(inProgressForm001).toHaveLength(1);
      expect(inProgressForm001[0].id).toBe('draft-1');
    });

    it('should count drafts by status', async () => {
      await db.drafts.bulkAdd([
        { ...sampleDraft, id: 'draft-1', status: 'in-progress' },
        { ...sampleDraft, id: 'draft-2', status: 'in-progress' },
        { ...sampleDraft, id: 'draft-3', status: 'completed' },
      ]);

      const inProgressCount = await db.drafts.where('status').equals('in-progress').count();
      expect(inProgressCount).toBe(2);
    });
  });

  describe('submissionQueue table', () => {
    const sampleSubmission: SubmissionQueueItem = {
      id: '019473a1-0000-7000-8000-000000000010',
      formId: 'form-001',
      payload: { responses: { q1: 'answer1' } },
      status: 'pending',
      retryCount: 0,
      lastAttempt: null,
      createdAt: '2026-02-11T10:00:00.000Z',
      error: null,
    };

    it('should add and retrieve a submission queue item', async () => {
      await db.submissionQueue.add(sampleSubmission);
      const retrieved = await db.submissionQueue.get(sampleSubmission.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('pending');
      expect(retrieved!.retryCount).toBe(0);
    });

    it('should query pending submissions by compound index [status+createdAt]', async () => {
      await db.submissionQueue.bulkAdd([
        { ...sampleSubmission, id: 'sub-1', status: 'pending', createdAt: '2026-02-11T09:00:00.000Z' },
        { ...sampleSubmission, id: 'sub-2', status: 'synced', createdAt: '2026-02-11T09:30:00.000Z' },
        { ...sampleSubmission, id: 'sub-3', status: 'pending', createdAt: '2026-02-11T10:00:00.000Z' },
      ]);

      const pending = await db.submissionQueue.where('status').equals('pending').toArray();
      expect(pending).toHaveLength(2);
    });

    it('should update retry count and error on failure', async () => {
      await db.submissionQueue.add(sampleSubmission);

      await db.submissionQueue.update(sampleSubmission.id, {
        status: 'failed',
        retryCount: 1,
        lastAttempt: '2026-02-11T10:05:00.000Z',
        error: 'Network timeout',
      });

      const failed = await db.submissionQueue.get(sampleSubmission.id);
      expect(failed!.status).toBe('failed');
      expect(failed!.retryCount).toBe(1);
      expect(failed!.error).toBe('Network timeout');
    });
  });

  describe('formSchemaCache table', () => {
    const sampleSchema: CachedFormSchema = {
      formId: 'form-001',
      version: 1,
      schema: {
        title: 'Survey Form',
        questions: [{ id: 'q1', type: 'text', label: 'Name' }],
      },
      cachedAt: '2026-02-11T10:00:00.000Z',
      etag: '"abc123"',
    };

    it('should cache and retrieve a form schema', async () => {
      await db.formSchemaCache.add(sampleSchema);
      const retrieved = await db.formSchemaCache.get('form-001');

      expect(retrieved).toBeDefined();
      expect(retrieved!.version).toBe(1);
      expect(retrieved!.schema).toEqual(sampleSchema.schema);
    });

    it('should update cached schema when version changes', async () => {
      await db.formSchemaCache.add(sampleSchema);

      await db.formSchemaCache.put({
        ...sampleSchema,
        version: 2,
        schema: { ...sampleSchema.schema, title: 'Updated Survey' },
        cachedAt: '2026-02-11T11:00:00.000Z',
        etag: '"def456"',
      });

      const updated = await db.formSchemaCache.get('form-001');
      expect(updated!.version).toBe(2);
      expect(updated!.etag).toBe('"def456"');
    });
  });

  describe('schema versioning', () => {
    it('should have version 1 with all three tables', () => {
      expect(db.tables.map((t) => t.name).sort()).toEqual(
        ['drafts', 'formSchemaCache', 'submissionQueue'].sort()
      );
    });

    it('should have correct indexes on drafts table', () => {
      const draftsSchema = db.tables.find((t) => t.name === 'drafts')!.schema;
      const indexNames = draftsSchema.indexes.map((i) => i.name);

      expect(indexNames).toContain('formId');
      expect(indexNames).toContain('status');
      expect(indexNames).toContain('updatedAt');
      expect(indexNames).toContain('[formId+status]');
    });

    it('should have correct indexes on submissionQueue table', () => {
      const queueSchema = db.tables.find((t) => t.name === 'submissionQueue')!.schema;
      const indexNames = queueSchema.indexes.map((i) => i.name);

      expect(indexNames).toContain('formId');
      expect(indexNames).toContain('status');
      expect(indexNames).toContain('createdAt');
      expect(indexNames).toContain('[status+createdAt]');
    });
  });
});
