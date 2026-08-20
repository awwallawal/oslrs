/**
 * Story 13-51 (AC1) — Super-Admin page: the people we have gone silent on.
 *
 * `email_suppressions` changes system behaviour and reports to nobody. A bounce costs a contact
 * channel permanently and silently, and until this page nothing anywhere told an operator that the
 * register had stopped writing to someone. This is the reporting half of a monitor that has only
 * ever acted.
 */
import { useState } from 'react';
import { useSuppressedContacts } from '../hooks/useSuppressedContacts';
import { SuppressedContactsTable } from '../components/SuppressedContactsTable';
import { CorrectContactDialog } from '../components/CorrectContactDialog';
import type { SuppressedContactRow } from '../api/suppressed-contacts.api';

export function SuppressedContactsPage() {
  const { data, isLoading, isPlaceholderData, isError } = useSuppressedContacts();
  // Default at the consumption site (the repo's race-condition rule) — the hook uses
  // `placeholderData`, which deliberately does NOT make the query look already-loaded (H1).
  const rows = data ?? [];
  // ⚠️ TREAT THE PLACEHOLDER AS "STILL LOADING" (code-review H1). The empty state on this page is
  // not a neutral blank — it asserts **"Nobody is being silently dropped."** Showing that while a
  // request is still in flight is a smaller version of the same lie, so an unresolved query says
  // "Loading…" and nothing else.
  const pending = isLoading || isPlaceholderData;
  const [correcting, setCorrecting] = useState<SuppressedContactRow | null>(null);

  const midLadder = rows.filter((r) => r.midLadder).length;
  // ⚠️ `given_up` ONLY — code-review M1. This banner tells an operator to pick up the phone, so it
  // must never count somebody who unsubscribed or filed a complaint. A dead mailbox is a reason to
  // try another channel; a person's stated wish is a reason to stop.
  const givenUp = rows.filter((r) => r.emailState === 'given_up' && r.phoneNumber).length;
  const optedOut = rows.filter((r) => r.emailState === 'opted_out').length;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Suppressed contacts</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Addresses the system has stopped sending to. A suppressed address is not the same as an unreachable
        person — check the “reachable elsewhere” column and the phone number before correcting anything.
      </p>

      {!pending && rows.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded bg-slate-100 px-3 py-1">{rows.length} suppressed</span>
          {midLadder > 0 && (
            <span className="rounded bg-red-100 px-3 py-1 font-medium text-red-900">
              {midLadder} mid-ladder — the system is still “reminding” them into a void
            </span>
          )}
          {givenUp > 0 && (
            <span className="rounded bg-amber-100 px-3 py-1 text-amber-900">
              {givenUp} given up on by email but have a phone number
            </span>
          )}
          {optedOut > 0 && (
            <span className="rounded bg-slate-100 px-3 py-1 text-slate-700">
              {optedOut} opted out — do not contact by any channel
            </span>
          )}
        </div>
      )}

      <div className="mt-4 rounded border border-slate-200 bg-white">
        {pending && <p className="p-6 text-sm text-slate-600">Loading…</p>}
        {isError && <p className="p-6 text-sm text-red-700">Could not load the suppression list.</p>}
        {!pending && !isError && <SuppressedContactsTable rows={rows} onCorrect={setCorrecting} />}
      </div>

      {correcting && <CorrectContactDialog row={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}

export default SuppressedContactsPage;
