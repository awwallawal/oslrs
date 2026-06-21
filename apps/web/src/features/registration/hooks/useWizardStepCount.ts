import { useQuery } from '@tanstack/react-query';
import { fetchPublicActiveForm } from '../api/wizard.api';

/**
 * Story 9-40 L2 — total wizard step count ("of N") for the dashboard draft card.
 *
 * The `me.service` registration-status read-model DELIBERATELY omits the total
 * (it returns the authoritative `draftStep`; the client supplies "of N" from the
 * wizard config it renders). This hook derives N from the SAME pinned-form query
 * the wizard uses (shared TanStack key `['wizard','public-active-form']`, so it's
 * a cache hit if the wizard already loaded it), mirroring `WizardPage.buildSteps`:
 *   N = HEAD_STEPS (Basics/Contact/Consent) + one step per unique form section + Review.
 *
 * Returns `undefined` while the form is unresolved (or there is no pinned form),
 * so the caller can fall back to showing just "Step X" without an "of N".
 */
const HEAD_STEP_COUNT = 3; // Basics, Contact, Consent — keep in sync with WizardPage.HEAD_STEPS
const REVIEW_STEP_COUNT = 1;

export function useWizardStepCount(enabled = true): number | undefined {
  const { data: form } = useQuery({
    queryKey: ['wizard', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  if (!form) return undefined;
  const sectionIds = new Set((form.questions ?? []).map((q) => q.sectionId));
  return HEAD_STEP_COUNT + sectionIds.size + REVIEW_STEP_COUNT;
}
