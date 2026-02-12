/* eslint-disable no-console */
// SPIKE: prep-5 — Offline-first PWA proof-of-concept page
// Demonstrates: Dexie CRUD, useLiveQuery reactivity, persistent storage, SW registration
// Route: /spike/offline (dev-only, not linked from navigation)
// This page can be cleanly removed or evolved into production code in Stories 3.2/3.3.

import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { uuidv7 } from 'uuidv7';
import { db, type Draft } from '../../lib/offline-db';
import { apiClient } from '../../lib/api-client'; // SPIKE: prep-5 — for Background Sync demonstration

// SPIKE: prep-5 — Storage quota display
function StorageInfo() {
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    // AC4: Request persistent storage and estimate quota
    async function checkStorage() {
      if (navigator.storage?.persist) {
        const granted = await navigator.storage.persist();
        setPersisted(granted);
      }
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setQuota({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
    }
    checkStorage();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="bg-neutral-100 rounded-lg p-4 space-y-2">
      <h3 className="font-semibold text-sm text-neutral-700">Storage Info (AC4)</h3>
      <div className="text-sm space-y-1">
        <p>
          Persistent Storage:{' '}
          <span className={persisted ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
            {persisted === null ? 'Checking...' : persisted ? 'Granted' : 'Not Granted'}
          </span>
        </p>
        {quota && (
          <>
            <p>Used: {formatBytes(quota.usage)}</p>
            <p>Available: {formatBytes(quota.quota)}</p>
            <p>Usage: {((quota.usage / quota.quota) * 100).toFixed(4)}%</p>
          </>
        )}
      </div>
    </div>
  );
}

// SPIKE: prep-5 — Service worker status display
function ServiceWorkerStatus() {
  const [swStatus, setSwStatus] = useState<string>('Checking...');

  useEffect(() => {
    async function checkSW() {
      if (!('serviceWorker' in navigator)) {
        setSwStatus('Not supported');
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration('/spike-sw.js');
      if (registration) {
        if (registration.active) setSwStatus('Active');
        else if (registration.installing) setSwStatus('Installing');
        else if (registration.waiting) setSwStatus('Waiting');
        else setSwStatus('Registered (no active worker)');
      } else {
        setSwStatus('Not registered (build & preview to test)');
      }
    }
    checkSW();
  }, []);

  return (
    <div className="bg-neutral-100 rounded-lg p-4 space-y-2">
      <h3 className="font-semibold text-sm text-neutral-700">Service Worker (AC1/AC3)</h3>
      <p className="text-sm">
        Status: <span className="font-medium">{swStatus}</span>
      </p>
      <p className="text-xs text-neutral-500">
        SW only activates in production builds. Run &quot;pnpm build &amp;&amp; pnpm preview&quot; to test.
      </p>
    </div>
  );
}

// SPIKE: prep-5 — Main PoC page
export default function SpikeOfflinePage() {
  const [formData, setFormData] = useState({ q1: '', q2: '' });

  // AC2/AC3: useLiveQuery for reactive draft count and list
  const drafts = useLiveQuery(() => db.drafts.toArray()) ?? [];
  const draftCount = useLiveQuery(() => db.drafts.count()) ?? 0;
  const pendingSubmissions = useLiveQuery(
    () => db.submissionQueue.where('status').equals('pending').count()
  ) ?? 0;

  // SPIKE: prep-5 — Status message for user feedback on errors
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // AC3: Create draft with Dexie
  const createDraft = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const draft: Draft = {
        id: uuidv7(),
        formId: 'spike-form-001',
        formVersion: '1.0.0',
        responses: { q1: formData.q1, q2: formData.q2 },
        questionPosition: 0,
        status: 'in-progress',
        createdAt: now,
        updatedAt: now,
      };
      await db.drafts.add(draft);
      setFormData({ q1: '', q2: '' });
      setStatusMsg(null);
    } catch (err) {
      console.error('SPIKE: prep-5 — createDraft failed:', err);
      setStatusMsg(`Failed to create draft: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [formData]);

  // AC3: Update draft status to completed
  const completeDraft = useCallback(async (id: string) => {
    try {
      await db.drafts.update(id, {
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
      setStatusMsg(null);
    } catch (err) {
      console.error('SPIKE: prep-5 — completeDraft failed:', err);
      setStatusMsg(`Failed to complete draft: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // AC3: Submit draft — moves to submission queue + fires fetch for Background Sync
  const submitDraft = useCallback(async (draft: Draft) => {
    try {
      const now = new Date().toISOString();
      await db.submissionQueue.add({
        id: draft.id,
        formId: draft.formId,
        payload: draft.responses,
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        createdAt: now,
        error: null,
      });
      await db.drafts.update(draft.id, {
        status: 'submitted',
        updatedAt: now,
      });
      // SPIKE: prep-5 — Fire actual POST to exercise Background Sync via SW.
      // When offline, the SW's BackgroundSyncPlugin queues this request for 7-day retry.
      // The endpoint may not exist yet — that's expected for the spike.
      try {
        await apiClient('/submissions', {
          method: 'POST',
          body: JSON.stringify({
            id: draft.id,
            formId: draft.formId,
            responses: draft.responses,
          }),
        });
        await db.submissionQueue.update(draft.id, { status: 'synced' });
      } catch {
        // Expected when offline or endpoint doesn't exist yet — BG Sync handles retry
        console.info('SPIKE: prep-5 — POST queued for Background Sync (offline or endpoint unavailable)');
      }
      setStatusMsg(null);
    } catch (err) {
      console.error('SPIKE: prep-5 — submitDraft failed:', err);
      setStatusMsg(`Failed to submit draft: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Delete draft
  const deleteDraft = useCallback(async (id: string) => {
    try {
      await db.drafts.delete(id);
      setStatusMsg(null);
    } catch (err) {
      console.error('SPIKE: prep-5 — deleteDraft failed:', err);
      setStatusMsg(`Failed to delete draft: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Clear all data
  const clearAll = useCallback(async () => {
    try {
      await db.drafts.clear();
      await db.submissionQueue.clear();
      await db.formSchemaCache.clear();
      setStatusMsg(null);
    } catch (err) {
      console.error('SPIKE: prep-5 — clearAll failed:', err);
      setStatusMsg(`Failed to clear data: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Offline PWA Spike (prep-5)
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            PoC for Service Worker + IndexedDB offline-first architecture
          </p>
        </div>

        {/* Reactive Badge — AC3: useLiveQuery updates automatically */}
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            Drafts: {draftCount}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            Pending Sync: {pendingSubmissions}
          </span>
        </div>

        {/* SPIKE: prep-5 — Error feedback for IndexedDB operations */}
        {statusMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2">
            {statusMsg}
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StorageInfo />
          <ServiceWorkerStatus />
        </div>

        {/* Create Draft Form — AC3 */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold text-neutral-800">Create Draft (AC2/AC3)</h2>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Question 1 answer"
              value={formData.q1}
              onChange={(e) => setFormData((p) => ({ ...p, q1: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="text"
              placeholder="Question 2 answer"
              value={formData.q2}
              onChange={(e) => setFormData((p) => ({ ...p, q2: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <button
            onClick={createDraft}
            disabled={!formData.q1 && !formData.q2}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            Save Draft to IndexedDB
          </button>
        </div>

        {/* Draft List — AC3: Reactive via useLiveQuery */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-800">
              Drafts ({draftCount}) — Live Query
            </h2>
            <button
              onClick={clearAll}
              className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
            >
              Clear All
            </button>
          </div>

          {drafts.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">
              No drafts yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex items-center justify-between p-3 bg-neutral-50 rounded-md border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">
                      {draft.id.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-neutral-500">
                      Q1: {String(draft.responses.q1 ?? '-')} | Q2: {String(draft.responses.q2 ?? '-')}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                        draft.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-700'
                          : draft.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {draft.status}
                    </span>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {draft.status === 'in-progress' && (
                      <button
                        onClick={() => completeDraft(draft.id)}
                        className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                      >
                        Complete
                      </button>
                    )}
                    {draft.status === 'completed' && (
                      <button
                        onClick={() => submitDraft(draft)}
                        className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                      >
                        Submit
                      </button>
                    )}
                    <button
                      onClick={() => deleteDraft(draft.id)}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Background Sync Info — AC3 */}
        <div className="bg-neutral-100 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm text-neutral-700">Background Sync (AC3)</h3>
          <p className="text-xs text-neutral-500">
            workbox-background-sync is configured in the service worker (spike-sw.ts).
            POST requests to /api/* that fail while offline are queued and retried
            automatically when connectivity is restored (maxRetentionTime: 7 days).
          </p>
          <p className="text-xs text-neutral-500">
            Test: Build → Preview → Create draft → Complete → Submit → Go offline →
            Check DevTools → Application → Background Sync for queued requests.
          </p>
        </div>

        {/* Architecture Summary */}
        <div className="bg-neutral-100 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm text-neutral-700">Architecture Summary</h3>
          <pre className="text-xs text-neutral-600 whitespace-pre-wrap font-mono">
{`App (React) ←→ Dexie (IndexedDB)
  ↓ useLiveQuery → reactive UI updates
  ↓ on submit → submissionQueue table

Service Worker (Workbox)
  ├─ Precache: app shell (HTML/JS/CSS)
  ├─ CacheFirst: static assets (30d)
  ├─ NetworkFirst: GET /api/* (1h)
  └─ NetworkOnly + BackgroundSync: POST /api/*
     └─ Queue failed POSTs for 7-day retry`}
          </pre>
        </div>
      </div>
    </div>
  );
}
