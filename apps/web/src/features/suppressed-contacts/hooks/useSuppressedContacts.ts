/**
 * Story 13-51 — TanStack Query hooks for the suppressed-contact surface.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSuppressedContacts,
  correctContactEmail,
  type SuppressedContactRow,
  type CorrectContactResult,
} from '../api/suppressed-contacts.api';

export const suppressedContactKeys = {
  all: ['suppressed-contacts'] as const,
  list: () => [...suppressedContactKeys.all, 'list'] as const,
};

export function useSuppressedContacts() {
  return useQuery<SuppressedContactRow[]>({
    queryKey: suppressedContactKeys.list(),
    queryFn: listSuppressedContacts,
    // ⛔ `placeholderData`, NEVER `initialData` — code-review H1.
    //
    // Both satisfy the repo's standing rule that Query data defaults to [] rather than undefined.
    // They are NOT interchangeable. `initialData` is written INTO the cache with
    // `dataUpdatedAt = now`, so with any `staleTime` the query is not stale on mount and
    // `refetchOnMount` skips the fetch entirely — measured here: queryFn called ZERO times, data
    // stuck at []. It also forces `status: 'success'`, so `isLoading` is false and the page
    // renders the empty-state immediately: **"No suppressed addresses. Nobody is being silently
    // dropped."** — a categorical false statement, on the one screen this story exists to build,
    // about the exact people it exists to surface.
    //
    // `placeholderData` is shown WITHOUT being cached as real data, so the fetch still runs. It is
    // what `useAuditLogs.ts` (the exemplar this feature mirrors) already uses.
    placeholderData: [],
    staleTime: 30_000,
  });
}

/** Naming follows the repo convention: `use<Action><Entity>`. */
export function useCorrectContactEmail() {
  const queryClient = useQueryClient();
  return useMutation<CorrectContactResult, Error, { respondentId: string; to: string; reason: string }>({
    mutationFn: correctContactEmail,
    onSuccess: () => {
      // The corrected row leaves the list (its suppression was lifted), so the list must refetch
      // rather than be patched — a stale row here reads as "still silenced".
      void queryClient.invalidateQueries({ queryKey: suppressedContactKeys.all });
    },
  });
}
