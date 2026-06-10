/**
 * PublicWizardFormCard — read-only mirror of the public-wizard pinned form.
 *
 * Story 9-17 AC#A5: the PRIMARY pin/unpin control lives on the Questionnaire
 * Management page (next to publish). This card is a discoverability mirror on
 * the Settings landing page — it shows which form is currently pinned and links
 * back to Q.M. It is intentionally READ-ONLY (no Pin / Unpin / Edit here); that
 * placement decision is load-bearing UX from the 2026-05-12 UAT session.
 */
import { Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuestionnaire } from '../../questionnaires/hooks/useQuestionnaires';

interface Props {
  /** Currently-pinned form id (from the `wizard.public_form_id` setting). */
  pinnedId: string | null;
  /** When the setting was last changed — used for the "pinned X ago" hint. */
  pinnedAt?: string;
}

/** Best-effort "pinned 3 days ago" hint; empty string when unavailable. */
function relativePinnedHint(pinnedAt?: string): string {
  if (!pinnedAt) return '';
  const then = new Date(pinnedAt).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  try {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (Math.abs(days) >= 1) return ` — pinned ${rtf.format(-days, 'day')}`;
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    return ` — pinned ${rtf.format(-hours, 'hour')}`;
  } catch {
    // Intl unavailable — fall back to the raw short date.
    return ` — pinned ${pinnedAt.slice(0, 10)}`;
  }
}

export function PublicWizardFormCard({ pinnedId, pinnedAt }: Props) {
  const { data: form, isLoading } = useQuestionnaire(pinnedId ?? '');

  let body: string;
  if (!pinnedId) {
    body = 'None — no form is active for the public wizard';
  } else if (isLoading) {
    body = 'Loading pinned form…';
  } else if (form?.data) {
    body = `Currently pinned: ${form.data.title} (v${form.data.version})${relativePinnedHint(pinnedAt)}`;
  } else {
    // Form fetch failed or the pinned id no longer resolves to a form.
    body = `Currently pinned: ${pinnedId}${relativePinnedHint(pinnedAt)}`;
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      data-testid="settings-public-wizard-form-card"
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
          <Globe className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">Public Wizard Form</h2>
          <p className="mt-0.5 text-sm text-gray-600">{body}</p>
          <Link
            to="/dashboard/super-admin/questionnaires"
            className="mt-3 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Manage in Questionnaires →
          </Link>
        </div>
      </div>
    </div>
  );
}
