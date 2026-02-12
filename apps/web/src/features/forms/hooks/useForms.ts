import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublishedForms, fetchFormForRender, fetchFormForPreview } from '../api/form.api';
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
    queryFn: () => fetchFormForRender(formId),
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
 * Returns a map of formId → true for forms that have an in-progress draft in IndexedDB.
 */
export function useFormDrafts() {
  const [draftMap, setDraftMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDrafts() {
      try {
        const drafts = await db.drafts.where('status').equals('in-progress').toArray();
        const map: Record<string, boolean> = {};
        for (const d of drafts) {
          map[d.formId] = true;
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
