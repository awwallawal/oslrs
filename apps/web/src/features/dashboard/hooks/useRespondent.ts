/**
 * Respondent TanStack Query hooks
 *
 * Query key factory and hooks for respondent detail.
 * Created in Story 5.3 (Individual Record PII View).
 */

import { useQuery } from '@tanstack/react-query';
import { fetchRespondentDetail } from '../api/respondent.api';

// ── Query Key Factory ─────────────────────────────────────────────────

export const respondentKeys = {
  all: ['respondents'] as const,
  detail: (id: string) => [...respondentKeys.all, 'detail', id] as const,
};

// ── Query Hooks ───────────────────────────────────────────────────────

export function useRespondentDetail(id: string) {
  return useQuery({
    queryKey: respondentKeys.detail(id),
    queryFn: () => fetchRespondentDetail(id),
    enabled: !!id,
    staleTime: 60_000, // 60s — detail data changes infrequently
  });
}
