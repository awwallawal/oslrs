import { describe, it, expect } from 'vitest';
import {
  resolveBoundQuestionnaireFormId,
  PUBLIC_FORM_UNBOUND_SENTINEL,
} from '../questionnaire-form-binding.js';

// Story 13-23 (AC2/AC3) — the pure binding resolver. Proves the precedence
// (payload → server → draft → sentinel) and the UUID-only discipline that keeps
// a non-joinable value from ever being persisted as the form id.

const PAYLOAD = '019f48c2-0001-7000-8000-000000000001';
const SERVER = '019f48c2-0002-7000-8000-000000000002';
const DRAFT = '019f48c2-0003-7000-8000-000000000003';

describe('resolveBoundQuestionnaireFormId', () => {
  it('prefers the payload UUID over server + draft', () => {
    expect(
      resolveBoundQuestionnaireFormId({
        payloadFormId: PAYLOAD,
        serverResolvedFormId: SERVER,
        draftFormId: DRAFT,
      }),
    ).toEqual({ formId: PAYLOAD, source: 'payload' });
  });

  it('falls back to the server-resolved pin when the payload is absent', () => {
    expect(
      resolveBoundQuestionnaireFormId({
        payloadFormId: undefined,
        serverResolvedFormId: SERVER,
        draftFormId: DRAFT,
      }),
    ).toEqual({ formId: SERVER, source: 'server' });
  });

  it('falls back to the draft value (back-compat) when payload + server are absent', () => {
    expect(
      resolveBoundQuestionnaireFormId({ draftFormId: DRAFT }),
    ).toEqual({ formId: DRAFT, source: 'draft' });
  });

  it('returns the loud sentinel when no source is available', () => {
    expect(resolveBoundQuestionnaireFormId({})).toEqual({
      formId: PUBLIC_FORM_UNBOUND_SENTINEL,
      source: 'sentinel',
    });
  });

  it('IGNORES a present-but-non-UUID value and falls through (13-16 slug-vs-UUID discipline)', () => {
    // The old human slug / the sentinel itself / any garbage must NOT be trusted:
    // a non-joinable value falls through to the next source, then the sentinel.
    expect(
      resolveBoundQuestionnaireFormId({
        payloadFormId: 'oslsr_public_core_v1', // human slug (formId), not the row PK
        serverResolvedFormId: '  ',
        draftFormId: PUBLIC_FORM_UNBOUND_SENTINEL, // a legacy sentinel draft
      }),
    ).toEqual({ formId: PUBLIC_FORM_UNBOUND_SENTINEL, source: 'sentinel' });
  });

  it('uses the first UUID-valid source even when an earlier source is malformed', () => {
    expect(
      resolveBoundQuestionnaireFormId({
        payloadFormId: 'not-a-uuid',
        serverResolvedFormId: SERVER,
        draftFormId: DRAFT,
      }),
    ).toEqual({ formId: SERVER, source: 'server' });
  });
});
