/**
 * Story 13-51 (AC1) — the list of people the register has gone silent on.
 *
 * ⚠️ THE THREE BUCKETS ARE RENDERED, NOT DECIDED, HERE. `bucket` arrives from
 * `classifySuppressedAddress` on the server — a pure, exported, tested function — because a rule
 * that lives inside a component cannot be RED-verified and cannot be reused by 13-42's digest
 * line. This file must never re-derive it.
 */
import type { SuppressedContactRow, SuppressedAddressBucket } from '../api/suppressed-contacts.api';

const BUCKET_LABEL: Record<SuppressedAddressBucket, string> = {
  capture_typo: 'Our typo',
  provider_artefact: 'Provider format',
  plausibly_dead: 'Their mailbox',
};

const BUCKET_HINT: Record<SuppressedAddressBucket, string> = {
  capture_typo: 'Someone mistyped this at capture. A human can still fix it.',
  provider_artefact:
    'Nobody typed this — it arrived in the provider’s bounce payload. Fixed at the inlet, never by retyping.',
  plausibly_dead: 'A well-formed address at a real domain. Not ours to retype.',
};

const BUCKET_CLASS: Record<SuppressedAddressBucket, string> = {
  capture_typo: 'bg-amber-100 text-amber-900',
  provider_artefact: 'bg-slate-100 text-slate-700',
  plausibly_dead: 'bg-sky-100 text-sky-900',
};

export interface SuppressedContactsTableProps {
  rows: SuppressedContactRow[];
  onCorrect: (row: SuppressedContactRow) => void;
}

export function SuppressedContactsTable({ rows, onCorrect }: SuppressedContactsTableProps) {
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-slate-600">No suppressed addresses. Nobody is being silently dropped.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Kind</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Reachable elsewhere</th>
            <th className="px-3 py-2">Email state</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email} className={`border-t border-slate-200 ${row.midLadder ? 'bg-red-50' : ''}`}>
              <td className="px-3 py-2 font-mono text-xs break-all">{row.email}</td>

              <td className="px-3 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${BUCKET_CLASS[row.bucket]}`} title={BUCKET_HINT[row.bucket]}>
                  {BUCKET_LABEL[row.bucket]}
                </span>
              </td>

              <td className="px-3 py-2">
                {row.referenceCode ? (
                  <>
                    <div className="font-medium">{row.name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-500">{row.referenceCode}</div>
                  </>
                ) : (
                  <span className="text-slate-400">not matched to a respondent</span>
                )}
              </td>

              {/* AC1.3 — for anyone unreachable by email this is the actual next step. */}
              <td className="px-3 py-2 whitespace-nowrap">{row.phoneNumber ?? <span className="text-slate-400">none</span>}</td>

              <td className="px-3 py-2">
                {row.status ?? '—'}
                {/* AC1.1 — the system is actively pretending to contact this person, and the
                    ladder will retire them as though they had declined. */}
                {row.midLadder && (
                  <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">MID-LADDER</span>
                )}
              </td>

              {/* AC1.7 — a suppressed address is NOT "this person is unreachable". */}
              <td className="px-3 py-2 font-mono text-xs">
                {row.healthyTwin ? (
                  <span className="text-emerald-700">{row.healthyTwin}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>

              {/* ⚠️ THREE STATES, NOT A BOOLEAN — code-review M1. This column used to render
                  "given up — use phone" for anything that would not be retried, which included
                  every unsubscribe and complaint: it invited an operator to ring the one group of
                  people who had explicitly asked us to stop. */}
              <td className="px-3 py-2 text-xs">
                {row.emailState === 'opted_out' && (
                  <span className="font-medium text-slate-700">opted out — do not contact</span>
                )}
                {row.emailState === 'given_up' && (
                  <span className="font-medium text-red-700">given up — use phone</span>
                )}
                {row.emailState === 'holding' && (
                  <span className="text-slate-600">
                    holding{row.retryEligibleAt ? `, retries ${new Date(row.retryEligibleAt).toLocaleDateString()}` : ''}
                  </span>
                )}
                <div className="text-slate-400">
                  {row.reason}
                  {row.severity ? ` · ${row.severity}` : ' · severity never measured'} · {row.bounceCount}×
                </div>
              </td>

              <td className="px-3 py-2">
                {/* ⚠️ ONLY the capture-typo bucket is a candidate for correction. Offering this on
                    a provider artefact asks an operator to retype a string nobody typed; offering
                    it on a live-but-dead mailbox invites them to "fix" an address that was never
                    wrong. Both are worse than doing nothing. */}
                {row.bucket === 'capture_typo' && row.respondentId ? (
                  <button
                    type="button"
                    onClick={() => onCorrect(row)}
                    className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    Correct…
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SuppressedContactsTable;
