/**
 * Story 13-59 (AC5, AC6) — THE artefact surface. One implementation, two doors.
 *
 * AC6.2 is explicit about why this is a component and not two pieces of markup:
 * *"The sidebar entry LINKS to that section — it does not re-implement it.
 * 13-55's lesson: five hand-written copies of one operation. One implementation,
 * two doors."* So the first-login modal (AC5) and the permanent ProfilePage
 * section (AC6.1) both render THIS, and neither owns any of the download logic,
 * the entitlement rules or the missing-photo copy.
 *
 * ⚠️ AC5.3 — when the card has no photo this panel does NOT offer a download it
 * knows will fail. It says the photo is missing and links the 13-60 retry. That
 * is the concession the no-attachments ruling bought: *a pulled artefact can be
 * withheld at the point of delivery; a pushed attachment cannot.*
 */
import { Link } from 'react-router-dom';
import { AlertCircle, Check, CreditCard, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useDownloadArtefact, useStaffArtefacts } from '../hooks/useStaffArtefacts';
import type { ArtefactKind, ArtefactState } from '../api/artefacts.api';

interface ArtefactRowProps {
  kind: ArtefactKind;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  state: ArtefactState;
  pending: ArtefactKind | null;
  onDownload: (kind: ArtefactKind) => void;
}

function formatTaken(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ArtefactRow({ kind, title, blurb, icon, state, pending, onDownload }: ArtefactRowProps) {
  // Not this person's artefact — say nothing rather than explain an absence.
  if (!state.applicable) return null;

  const isPending = pending === kind;
  const taken = state.downloadedAt !== null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex gap-3 items-start flex-1">
        <span className="text-neutral-500 shrink-0 mt-0.5">{icon}</span>
        <div>
          <p className="font-medium text-neutral-900">{title}</p>
          <p className="text-sm text-neutral-600">{blurb}</p>

          {/* AC5.3 — the honest reason, and the way out of it. */}
          {state.unavailableReason === 'photo_missing' && (
            <p className="text-sm text-warning-600 mt-1 flex items-start gap-1">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Your card has no photo yet, so there is nothing to download.{' '}
                <Link to="/profile-completion" className="underline font-medium">
                  Add your photo
                </Link>{' '}
                and it will be ready.
              </span>
            </p>
          )}
          {state.unavailableReason === 'briefing_source_missing' && (
            <p className="text-sm text-warning-600 mt-1">
              The briefing is temporarily unavailable. Please tell your supervisor.
            </p>
          )}

          {taken && (
            <p className="text-sm text-success-600 mt-1 flex items-center gap-1">
              <Check className="w-4 h-4 shrink-0" />
              Downloaded {formatTaken(state.downloadedAt!)}
            </p>
          )}
        </div>
      </div>

      {state.available && (
        <Button
          type="button"
          variant={taken ? 'outline' : 'default'}
          onClick={() => onDownload(kind)}
          disabled={isPending}
          className="shrink-0"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              {taken ? 'Download again' : 'Download'}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export interface StaffArtefactsPanelProps {
  /**
   * Shown above the rows. The modal and the profile section frame the same
   * artefacts differently — "before you go to the field" vs "here they are,
   * whenever you need them" — and that framing is the ONLY thing they may vary.
   */
  intro?: React.ReactNode;
  /**
   * Story 13-59 (review M1) — the HEADING belongs to the panel, not to the page.
   *
   * ProfilePage used to render `<h2>My ID & Field Briefing</h2>` and "Save these
   * to your phone" itself, then drop this component underneath. For every
   * back-office role and every citizen the panel returns `null` and the page was
   * left showing a heading with nothing under it — an instruction to save files
   * that do not exist for them.
   *
   * A heading is part of the thing it names. Passing it in means the null return
   * below takes the heading with it, and no caller can reintroduce the orphan.
   */
  heading?: React.ReactNode;
}

export function StaffArtefactsPanel({ intro, heading }: StaffArtefactsPanelProps) {
  const { data, isLoading } = useStaffArtefacts();
  const { download, pending, error } = useDownloadArtefact();

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading">
        <div className="h-20 rounded-lg bg-neutral-100 animate-pulse" />
        <div className="h-20 rounded-lg bg-neutral-100 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-neutral-600">Unable to load your ID card and briefing right now.</p>;
  }

  // Neither artefact applies (back-office, or a citizen on the shared layout).
  if (!data.idCard.applicable && !data.briefing.applicable) return null;

  return (
    <div className="space-y-3">
      {heading}
      {intro}

      <ArtefactRow
        kind="id_card"
        title="Staff ID card"
        blurb="Your official card, with your photo and a QR code anyone can check."
        icon={<CreditCard className="w-5 h-5" />}
        state={data.idCard}
        pending={pending}
        onDownload={download}
      />

      <ArtefactRow
        kind="briefing"
        title="Enumerator field briefing"
        blurb="The field rules, including what to tell someone about their registration number."
        icon={<FileText className="w-5 h-5" />}
        state={data.briefing}
        pending={pending}
        onDownload={download}
      />

      {error && (
        <p role="alert" className="text-sm text-error-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default StaffArtefactsPanel;
