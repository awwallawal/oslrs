/**
 * Story 13-23 — bind a public wizard submission to the questionnaire form it was
 * filled on.
 *
 * `submissions.questionnaire_form_id` is `text NOT NULL`, and every consumer
 * joins it as `::uuid = questionnaireForms.id` (respondent.service.ts,
 * drizzle-runtime-smoke.ts) — so only a UUID row-PK is joinable. A non-UUID
 * value (the sentinel, a human slug, or a stale/forged string) is silently
 * excluded from every form-joined query. This module centralises the resolution
 * so the binding can never again fall to a silent sentinel unnoticed.
 *
 * Pure + total (no I/O) so it unit-tests directly without the controller's db
 * import graph.
 */

/**
 * The loud fallback value stamped when a public submission cannot be bound to a
 * joinable pinned-form UUID. Kept greppable/alertable; the controller emits a
 * counted WARN whenever the resolver returns `source: 'sentinel'`.
 */
export const PUBLIC_FORM_UNBOUND_SENTINEL = 'no-form-pinned-at-submit';

/** RFC-4122 UUID shape — mirrors the `::uuid` cast the join consumers rely on. */
const FORM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuestionnaireFormIdSource = 'payload' | 'server' | 'draft' | 'sentinel';

/**
 * Resolve the questionnaire form UUID to bind a public submission to, in
 * priority order:
 *   1. `payloadFormId`        — the UUID the wizard rendered (submit body; Story 13-23 AC2)
 *   2. `serverResolvedFormId` — the currently-pinned form resolved server-side (getPublicActiveForm)
 *   3. `draftFormId`          — the client-stamped draft value (back-compat for in-flight drafts)
 *   4. sentinel               — none joinable → {@link PUBLIC_FORM_UNBOUND_SENTINEL} + a loud WARN
 *
 * Every non-sentinel source MUST be a UUID (13-16 slug-vs-UUID discipline); a
 * present-but-malformed value falls through rather than persisting a
 * non-joinable id.
 */
export function resolveBoundQuestionnaireFormId(input: {
  payloadFormId?: string | null;
  serverResolvedFormId?: string | null;
  draftFormId?: string | null;
}): { formId: string; source: QuestionnaireFormIdSource } {
  const ordered: Array<[Exclude<QuestionnaireFormIdSource, 'sentinel'>, string | null | undefined]> = [
    ['payload', input.payloadFormId],
    ['server', input.serverResolvedFormId],
    ['draft', input.draftFormId],
  ];
  for (const [source, value] of ordered) {
    if (value && FORM_UUID_RE.test(value)) return { formId: value, source };
  }
  return { formId: PUBLIC_FORM_UNBOUND_SENTINEL, source: 'sentinel' };
}
