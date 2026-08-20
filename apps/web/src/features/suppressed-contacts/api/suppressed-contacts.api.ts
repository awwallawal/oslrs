/**
 * Story 13-51 (AC1, AC2) — API client for the suppressed-contact surface.
 *
 * Backend routes:  `apps/api/src/routes/suppressed-contacts.routes.ts`
 * Backend service: `apps/api/src/services/suppressed-contacts.service.ts`
 *                  `apps/api/src/services/contact-correction.service.ts`
 */
import { apiClient } from '../../../lib/api-client';

/** The three buckets of AC1.2 — they need opposite responses and must not be blurred. */
export type SuppressedAddressBucket = 'provider_artefact' | 'capture_typo' | 'plausibly_dead';

/**
 * Where the address stands. Mirrors `EmailContactState` in `apps/api/src/lib/bounce-severity.ts`,
 * which is the ONE owner of the rule.
 *
 * ⚠️ `opted_out` is NOT `given_up` (code-review M1). A bounce means the mailbox failed us and the
 * answer is another channel. An unsubscribe or a complaint means the PERSON did, and the answer is
 * to stop — never a prompt to ring them.
 */
export type EmailContactState = 'holding' | 'given_up' | 'opted_out';

export interface SuppressedContactRow {
  email: string;
  reason: string;
  severity: 'hard' | 'soft' | null;
  bounceCount: number;
  suppressedAt: string;
  bucket: SuppressedAddressBucket;
  suggestedCorrection: string | null;
  respondentId: string | null;
  referenceCode: string | null;
  name: string | null;
  phoneNumber: string | null;
  status: string | null;
  midLadder: boolean;
  healthyTwin: string | null;
  emailState: EmailContactState;
  retryEligibleAt: string | null;
}

export interface CorrectContactResult {
  respondentId: string;
  referenceCode: string | null;
  correctedTo: string;
  correctedFrom: string[];
  sourcesTouched: Record<string, number>;
  suppressionsLifted: string[];
  retrospective: boolean;
  resolvedAfter: string | null;
}

export async function listSuppressedContacts(): Promise<SuppressedContactRow[]> {
  const response = await apiClient('/admin/suppressed-contacts');
  return response.data;
}

/**
 * The clash refusal, surfaced with the owner's reference code (AC2.8). "Address in use" gives an
 * operator nothing to act on; a reference code does.
 */
export class ContactAddressClashError extends Error {
  constructor(
    message: string,
    public readonly ownerReferenceCode: string | null,
  ) {
    super(message);
    this.name = 'ContactAddressClashError';
  }
}

export async function correctContactEmail(input: {
  respondentId: string;
  to: string;
  reason: string;
}): Promise<CorrectContactResult> {
  try {
    const response = await apiClient('/admin/suppressed-contacts/correct', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    const e = err as { status?: number; data?: { error?: string; ownerReferenceCode?: string | null } };
    if (e?.status === 409) {
      throw new ContactAddressClashError(
        e.data?.error ?? 'That address already belongs to someone else.',
        e.data?.ownerReferenceCode ?? null,
      );
    }
    throw err;
  }
}
