/**
 * Export Hooks — TanStack Query hooks for export operations
 *
 * Story 5.4: Preview count query + manual download trigger.
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { fetchExportPreviewCount, downloadExport, fetchLgas } from '../api/export.api';
import type { ExportFilters } from '../api/export.api';

/** Query keys for export-related queries */
export const exportKeys = {
  all: ['exports'] as const,
  previewCount: (filters: ExportFilters) => [...exportKeys.all, 'count', filters] as const,
  lgas: ['lgas'] as const,
};

/**
 * Hook for preview record count.
 * Refreshes with filter changes, 30s stale time.
 */
export function useExportPreviewCount(filters: ExportFilters) {
  return useQuery({
    queryKey: exportKeys.previewCount(filters),
    queryFn: () => fetchExportPreviewCount(filters),
    staleTime: 30_000,
  });
}

/**
 * Hook for LGA list (filter dropdown).
 * Cached for 5 minutes since LGAs rarely change.
 */
export function useLgas() {
  return useQuery({
    queryKey: exportKeys.lgas,
    queryFn: fetchLgas,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for triggering export download.
 * Not a TanStack Query — manual async function that returns blob.
 */
export function useExportDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const download = useCallback(async (filters: ExportFilters, format: 'csv' | 'pdf') => {
    setIsDownloading(true);
    setError(null);
    try {
      const blob = await downloadExport(filters, format);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `oslsr-export-${dateStr}.${format}`;

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return filename;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Export failed'));
      throw err;
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return { download, isDownloading, error };
}
