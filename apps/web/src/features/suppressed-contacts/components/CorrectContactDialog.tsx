/**
 * Story 13-51 (AC2) — correct one address and lift its suppression, in one audited action.
 *
 * ⚠️ NEVER A SILENT REWRITE. The suggested correction is pre-filled and fully editable, and the
 * operator has to state a reason — the reason lands in the audit row. The respondent did not ask
 * for this and cannot be reached to confirm it, which is exactly why it must be traceable.
 */
import { useEffect, useRef, useState } from 'react';
import type { SuppressedContactRow } from '../api/suppressed-contacts.api';
import { ContactAddressClashError } from '../api/suppressed-contacts.api';
import { useCorrectContactEmail } from '../hooks/useSuppressedContacts';

export interface CorrectContactDialogProps {
  row: SuppressedContactRow;
  onClose: () => void;
}

export function CorrectContactDialog({ row, onClose }: CorrectContactDialogProps) {
  const [to, setTo] = useState(row.suggestedCorrection ?? row.email);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const correct = useCorrectContactEmail();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  /*
   * Code-review L4 — this is a modal that performs an irreversible, audited write to a citizen's
   * LOGIN IDENTITY, and it had no Escape handler, no initial focus and no dialog semantics: a
   * screen-reader user was dropped into an unannounced form and a keyboard user had no way out.
   * Radix `AlertDialog` (the repo's convention) is built for confirm/cancel, not for a form with
   * two required inputs, so this keeps the element and adds what the convention actually buys.
   */
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!row.respondentId) return;
    try {
      await correct.mutateAsync({ respondentId: row.respondentId, to, reason });
      onClose();
    } catch (err) {
      // AC2.3 / AC2.8 — say WHOSE it is. A generic "address in use" gives an operator nothing.
      if (err instanceof ContactAddressClashError) {
        setError(
          err.ownerReferenceCode
            ? `That address already belongs to ${err.ownerReferenceCode}. This would be a merge, not a correction.`
            : err.message,
        );
        return;
      }
      setError(err instanceof Error ? err.message : 'The correction failed.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // Click-away closes, but ONLY on the backdrop itself — never on a click that bubbled up
      // out of the form, which would discard a half-typed correction.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="correct-contact-title"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="correct-contact-title" className="text-lg font-semibold">
          Correct contact address
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {row.name ?? 'This respondent'} · <span className="font-mono">{row.referenceCode}</span>
        </p>

        {row.healthyTwin && (
          <p className="mt-3 rounded bg-emerald-50 p-2 text-sm text-emerald-900">
            ⚠️ This person is already reachable at <span className="font-mono">{row.healthyTwin}</span>. Check whether
            a correction is needed at all before changing anything.
          </p>
        )}

        <label className="mt-4 block text-sm font-medium">
          Current (suppressed)
          <input readOnly value={row.email} className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-sm" />
        </label>

        <label className="mt-3 block text-sm font-medium">
          Corrected address
          <input
            ref={firstFieldRef}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            required
          />
        </label>
        {row.suggestedCorrection && (
          <p className="mt-1 text-xs text-slate-500">
            Suggested from the typo dictionary — check it against what you know before applying. Nothing is
            auto-corrected.
          </p>
        )}

        <label className="mt-3 block text-sm font-medium">
          Why is this correction justified?
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="e.g. same-day draft twin carrying a NIN shows the intended spelling"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">
          This is written to the audit log with your user id. The respondent did not ask for this change.
        </p>

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={correct.isPending || !reason.trim()}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {correct.isPending ? 'Correcting…' : 'Correct and lift suppression'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CorrectContactDialog;
