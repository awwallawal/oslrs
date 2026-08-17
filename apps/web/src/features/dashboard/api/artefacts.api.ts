/**
 * Story 13-59 (AC5, AC6, AC7) — the two artefacts a staff member is entitled to
 * hold, and the downloads that prove they took them.
 *
 * ⚠️ The DOWNLOADS do not go through `apiClient`. That helper parses JSON; these
 * two endpoints return a PDF stream, and a JSON parse of a PDF is a corrupt
 * file, not an error. So they use `fetch` + `blob()`, following the existing
 * `IDCardDownload` component — which is also why the token is read from the
 * auth context and passed in, rather than from storage (9-42 F-004 / 9-49: the
 * access token is held in memory only).
 */
import { apiClient } from '../../../lib/api-client';

export type ArtefactUnavailableReason = 'photo_missing' | 'briefing_source_missing' | null;

export interface ArtefactState {
  applicable: boolean;
  available: boolean;
  unavailableReason: ArtefactUnavailableReason;
  /** ISO timestamp of the most recent download, or null if never taken. */
  downloadedAt: string | null;
}

export interface StaffArtefactState {
  idCard: ArtefactState;
  briefing: ArtefactState;
  /** AC7.4 — true while an applicable, available artefact is still untaken. */
  promptRequired: boolean;
}

export async function fetchArtefactState(): Promise<StaffArtefactState> {
  const response = await apiClient('/users/artefacts');
  return response.data;
}

export type ArtefactKind = 'id_card' | 'briefing';

const ENDPOINT: Record<ArtefactKind, string> = {
  id_card: '/users/id-card',
  briefing: '/users/field-briefing',
};

const FALLBACK_FILENAME: Record<ArtefactKind, string> = {
  id_card: 'oslrs-id-card.pdf',
  briefing: 'oslrs-enumerator-field-briefing.pdf',
};

function apiBase(): string {
  return import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1');
}

function filenameFrom(disposition: string | null, kind: ArtefactKind): string {
  if (disposition && disposition.includes('attachment')) {
    const match = /filename[^;=]*=((['"]).*?\2|[^;]*)/.exec(disposition);
    if (match?.[1]) return match[1].replace(/['"]/g, '');
  }
  return FALLBACK_FILENAME[kind];
}

/**
 * Fetch an artefact and hand it to the browser as a file.
 *
 * ⚠️ Rejects with the SERVER's message where there is one. AC5.3's whole point
 * is that "no photo yet" must read as a specific, actionable thing rather than
 * as a generic failure — a field officer who sees "Download failed" concludes
 * the app is broken; one who sees "no photo yet, add one here" acts.
 */
export async function downloadArtefact(kind: ArtefactKind, accessToken: string | null): Promise<void> {
  if (!accessToken) {
    throw new Error('Authentication required. Please sign in again.');
  }

  const response = await fetch(`${apiBase()}${ENDPOINT[kind]}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'The download could not be completed. Please try again.');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filenameFrom(response.headers.get('Content-Disposition'), kind);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
