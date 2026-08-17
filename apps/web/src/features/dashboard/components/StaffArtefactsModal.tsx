/**
 * Story 13-59 (AC5, AC7.4) — the prompt that turns an OFFER into a DELIVERY.
 *
 * ## Read AC7.1 before changing anything here
 *
 * *"A closeable modal that everyone dismisses has delivered nothing."* The
 * 2026-08-10 ruling removed the email attachments to protect seven months of
 * sender reputation, and AC4.2 names exactly what that cost: **guaranteed
 * offline possession** — the attachment landed in the inbox whether or not the
 * person acted. AC7 is what buys it back, and without it this story ends up
 * *worse* than the attachment design, not merely different.
 *
 * So the two properties below are the story, not polish:
 *
 * 1. **Closeable** (AC5.2) — nobody is trapped in a dialog. A field officer who
 *    is mid-task at 6am must be able to get past this.
 * 2. **Persistent** (AC7.4) — it comes BACK on the next session while anything
 *    is still outstanding, and stops for good once both are taken. That is the
 *    difference between an offer and a delivery.
 *
 * ⚠️ "Dismissed" is deliberately session-scoped state, NOT persisted. If a
 * dismissal were stored, one tap at 6am would silence it forever and we would
 * have shipped the offer, not the delivery.
 */
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { StaffArtefactsPanel } from './StaffArtefactsPanel';
import { useStaffArtefacts } from '../hooks/useStaffArtefacts';

export function StaffArtefactsModal() {
  const { data } = useStaffArtefacts();
  const [dismissed, setDismissed] = useState(false);

  /*
   * `promptRequired` is computed on the SERVER (staff-artefacts.service.ts).
   * The role rules — who is entitled to a card, who is entitled to a briefing —
   * live in one place, and this component does not get to hold a second opinion
   * about them (AC6.2).
   */
  const open = Boolean(data?.promptRequired) && !dismissed;

  /*
   * Review L3 — Escape must work.
   *
   * `open` was passed without `onOpenChange`, which makes the dialog fully
   * controlled with no way for Radix to report a close request: pressing Escape
   * fired an event nothing was listening to, and the only exit was the button.
   * AC5.2 is "nobody is trapped in a dialog", and a person who hits Escape and
   * watches nothing happen has been trapped, whatever the footer offers.
   *
   * Routed through the same `dismissed` state as "Not now" so both exits mean
   * the same thing — postponed, not satisfied — and the prompt still returns
   * next session while anything is outstanding (AC7.4).
   */
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) setDismissed(true); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Take these with you before you go</AlertDialogTitle>
          <AlertDialogDescription>
            Download them now, while you have network. Once they are saved on this phone you can
            open them anywhere — including an office with no data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <StaffArtefactsPanel />

        <AlertDialogFooter>
          {/*
            AC5.2 — the way out. It is worded as a postponement rather than a
            refusal because that is what it is: the dialog returns next session
            while anything is still outstanding.
          */}
          <AlertDialogCancel onClick={() => setDismissed(true)}>
            Not now
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default StaffArtefactsModal;
