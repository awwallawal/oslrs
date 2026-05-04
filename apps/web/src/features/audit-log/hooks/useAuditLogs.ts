/**
 * Story 9-11 — TanStack Query hooks for the Audit Log Viewer.
 *
 * Mirrors the 5 backend endpoints. Distinct-values + principal autocomplete
 * are heavily cached (staleTime 5 min) — those values change rarely.
 */
import { useQuery, useMutation, type UseMutationResult } from '@tanstack/react-query';
import {
  listAuditLogs,
  getAuditLogDetail,
  getDistinctValues,
  searchPrincipals,
  exportAuditLogs,
  type AuditLogFilter,
  type AuditLogListResult,
  type AuditLogRow,
  type PrincipalSearchResult,
  type ExportFilter,
  type ExportResult,
} from '../api/audit-log.api';

export const auditLogKeys = {
  all: ['audit-log'] as const,
  list: (filter: AuditLogFilter) => [...auditLogKeys.all, 'list', filter] as const,
  detail: (id: string) => [...auditLogKeys.all, 'detail', id] as const,
  distinct: (field: string) => [...auditLogKeys.all, 'distinct', field] as const,
  principals: (q: string) => [...auditLogKeys.all, 'principals', q] as const,
};

export function useAuditLogs(filter: AuditLogFilter) {
  return useQuery<AuditLogListResult>({
    queryKey: auditLogKeys.list(filter),
    queryFn: () => listAuditLogs(filter),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useAuditLogDetail(id: string | null) {
  return useQuery<AuditLogRow>({
    queryKey: auditLogKeys.detail(id ?? ''),
    queryFn: () => getAuditLogDetail(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

export function useDistinctActions() {
  return useQuery<string[]>({
    queryKey: auditLogKeys.distinct('action'),
    queryFn: () => getDistinctValues('action'),
    staleTime: 5 * 60_000,
  });
}

export function useDistinctTargetResources() {
  return useQuery<string[]>({
    queryKey: auditLogKeys.distinct('target_resource'),
    queryFn: () => getDistinctValues('target_resource'),
    staleTime: 5 * 60_000,
  });
}

export function usePrincipalSearch(query: string) {
  return useQuery<PrincipalSearchResult[]>({
    queryKey: auditLogKeys.principals(query),
    queryFn: () => searchPrincipals(query),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
  });
}

export function useExportAuditLog(): UseMutationResult<ExportResult, Error, ExportFilter> {
  return useMutation({
    mutationFn: (filter: ExportFilter) => exportAuditLogs(filter),
  });
}
