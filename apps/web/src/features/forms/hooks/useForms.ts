import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedForms, fetchFormForRender, fetchFormForPreview, type FlattenedForm } from '../api/form.api';
import { fetchMySubmissionCounts, fetchTeamSubmissionCounts, fetchDailySubmissionCounts } from '../api/submission.api';
import { db } from '../../../lib/offline-db';

export const formKeys = {
  all: ['forms'] as const,
  published: () => [...formKeys.all, 'published'] as const,
  render: (formId: string) => [...formKeys.all, 'render', formId] as const,
  preview: (formId: string) => [...formKeys.all, 'preview', formId] as const,
  submissionCounts: () => [...formKeys.all, 'submissionCounts'] as const,
  teamSubmissionCounts: () => [...formKeys.all, 'teamSubmissionCounts'] as const,
  dailyCounts: (days: number) => [...formKeys.all, 'dailyCounts', days] as const,
};

export function usePublishedForms() {
  return useQuery({
    queryKey: formKeys.published(),
    queryFn: fetchPublishedForms,
  });
}

export function useFormSchema(formId: string) {
  return useQuery({
    queryKey: formKeys.render(formId),
    queryFn: async () => {
      try {
        const schema = await fetchFormForRender(formId);
        // Write-through to Dexie for offline fallback
        await db.formSchemaCache.put({
          formId,
          version: schema.version,
          schema: schema as unknown as Record<string, unknown>,
          cachedAt: new Date().toISOString(),
          etag: null,
        });
        return schema;
      } catch (error) {
        // Offline fallback: try Dexie
        const cached = await db.formSchemaCache.get(formId);
        if (cached) {
          return cached.schema as unknown as FlattenedForm;
        }
        throw error;
      }
    },
    enabled: !!formId,
  });
}

export function useMySubmissionCounts() {
  return useQuery({
    queryKey: formKeys.submissionCounts(),
    queryFn: fetchMySubmissionCounts,
  });
}

export function useTeamSubmissionCounts() {
  return useQuery({
    queryKey: formKeys.teamSubmissionCounts(),
    queryFn: fetchTeamSubmissionCounts,
  });
}

export function useDailyCounts(days: number = 7) {
  return useQuery({
    queryKey: formKeys.dailyCounts(days),
    queryFn: () => fetchDailySubmissionCounts(days),
  });
}

export function useFormPreview(formId: string) {
  return useQuery({
    queryKey: formKeys.preview(formId),
    queryFn: () => fetchFormForPreview(formId),
    enabled: !!formId,
  });
}

/**
 * Returns a map of formId → 'in-progress' for forms with active drafts in IndexedDB.
 * Absent keys mean no draft exists (form available to start fresh).
 */
export function useFormDrafts() {
  const [draftMap, setDraftMap] = useState<Record<string, 'in-progress'>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDrafts() {
      try {
        const drafts = await db.drafts.where('status').equals('in-progress').toArray();
        const map: Record<string, 'in-progress'> = {};
        for (const d of drafts) {
          // Skip phantom drafts with no actual user data
          if (!d.responses || Object.keys(d.responses).length === 0) continue;
          map[d.formId] = 'in-progress';
        }
        setDraftMap(map);
      } finally {
        setLoading(false);
      }
    }
    loadDrafts();
  }, []);

  return { draftMap, loading };
}
