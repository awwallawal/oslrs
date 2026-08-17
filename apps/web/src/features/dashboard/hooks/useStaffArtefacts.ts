/**
 * Story 13-59 (AC6.2) — ONE source of artefact state for every surface that
 * shows it.
 *
 * The modal, the ProfilePage section and (later) anything else all read this
 * hook. 13-55's lesson was five hand-written copies of one operation; the same
 * mistake here would be two components disagreeing about whether a person still
 * owes themselves a download — one nagging, the other saying they are done.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchArtefactState, downloadArtefact, type ArtefactKind } from '../api/artefacts.api';
import { useAuth } from '../../auth/context/AuthContext';

export const ARTEFACTS_QUERY_KEY = ['users', 'artefacts'] as const;

export function useStaffArtefacts() {
  return useQuery({
    queryKey: ARTEFACTS_QUERY_KEY,
    queryFn: fetchArtefactState,
    // Changes only when the person downloads something or adds a photo.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Download an artefact and refresh the state.
 *
 * ⚠️ NOT `useOptimisticMutation`. An optimistic "downloaded" flag would be a
 * lie in exactly the case that matters: the download failing while the UI marks
 * it delivered. AC7 exists to distinguish an offer from a delivery, so the
 * state moves only after the server has recorded the download and told us so —
 * which means invalidating and refetching, not writing the cache ourselves.
 */
export function useDownloadArtefact() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ArtefactKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: ArtefactKind): Promise<boolean> {
    setPending(kind);
    setError(null);
    try {
      await downloadArtefact(kind, accessToken);
      await queryClient.invalidateQueries({ queryKey: ARTEFACTS_QUERY_KEY });
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The download could not be completed.');
      return false;
    } finally {
      setPending(null);
    }
  }

  return { download, pending, error };
}
