import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedForms, fetchFormForRender, fetchFormForPreview, type FlattenedForm } from '../api/form.api';
import { db } from '../../../lib/offline-db';

export const formKeys = {
  all: ['forms'] as const,
  published: () => [...formKeys.all, 'published'] as const,
  render: (formId: string) => [...formKeys.all, 'render', formId] as const,
  preview: (formId: string) => [...formKeys.all, 'preview', formId] as const,
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

export function useFormPreview(formId: string) {
  return useQuery({
    queryKey: formKeys.preview(formId),
    queryFn: () => fetchFormForPreview(formId),
    enabled: !!formId,
  });
}

/**
 * Returns a map of formId → draft status for forms with drafts in IndexedDB.
 * Values: 'in-progress' (active draft) or 'completed' (submitted, awaiting sync or synced).
 * Absent keys mean no draft exists (not started).
 */
export function useFormDrafts() {
  const [draftMap, setDraftMap] = useState<Record<string, 'in-progress' | 'completed'>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDrafts() {
      try {
        const drafts = await db.drafts.where('status').anyOf('in-progress', 'completed').toArray();
        const map: Record<string, 'in-progress' | 'completed'> = {};
        for (const d of drafts) {
          // If multiple drafts exist for the same form, prefer 'in-progress' over 'completed'
          if (!map[d.formId] || d.status === 'in-progress') {
            map[d.formId] = d.status as 'in-progress' | 'completed';
          }
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
