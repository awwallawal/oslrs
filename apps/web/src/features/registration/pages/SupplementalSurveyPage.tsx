import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../lib/api-client';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { FormRenderer } from '../../forms/components/FormRenderer';
import { fetchPublicActiveForm } from '../api/wizard.api';
import { submitSupplementalSurvey } from '../api/supplemental-survey.api';

/**
 * Story 9-28 Path B — Cohort A supplemental-survey landing page.
 *
 * Reached via `/register/supplemental?token=…`, after the user clicks
 * "Complete my skills profile" on the MagicLinkLandingPage. The page fetches
 * the canonical public questionnaire (same source as wizard Step 4) and
 * lets the respondent answer it; on submit, the magic-link token is
 * consumed and a `submissions` row is written for the existing respondent.
 *
 * The respondent already has an identity row in `respondents` (Cohort A is
 * defined as "completed wizard registrants whose Step 4 was dropped pre-9-26").
 * This page does NOT re-collect identity — only the questionnaire.
 *
 * No apology / no admission copy. Audit-safe framing matches the email
 * template's Option 2 phrasing ("Complete your skills profile").
 */

export default function SupplementalSurveyPage() {
  useDocumentTitle('Complete your skills profile | Oyo State Skills Registry');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const formQuery = useQuery({
    queryKey: ['supplemental-survey', 'public-active-form'],
    queryFn: fetchPublicActiveForm,
    staleTime: 5 * 60 * 1000,
    enabled: token.length > 0,
  });
  const form = formQuery.data ?? null;

  const [submissionUid, setSubmissionUid] = useState<string | null>(null);

  // M4 fix — mutationFn accepts the payload directly (instead of closing over
  // component state) so onComplete's just-merged answers can never be missed.
  const submitMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      submitSupplementalSurvey({ token, questionnaireResponses: payload }),
    onSuccess: (result) => {
      setSubmissionUid(result.submissionUid);
    },
  });

  const initialResponses = useMemo(() => ({}), []);

  if (!token) {
    return (
      <CenteredCard testId="supplemental-missing-token">
        <h1 className="text-xl font-semibold text-neutral-900">Link incomplete</h1>
        <p className="mt-3 text-sm text-neutral-700">
          This link is missing a token. Please open it again from your email,
          or contact support if the issue persists.
        </p>
      </CenteredCard>
    );
  }

  if (submissionUid) {
    // M6 fix — wrap success in role="status" + aria-live so screen-readers
    // are announced on the transition. L10 — show short reference, not full UUID.
    const shortRef = submissionUid.slice(0, 8);
    return (
      <CenteredCard testId="supplemental-success">
        <div role="status" aria-live="polite">
          <h1 className="text-xl font-semibold text-neutral-900">Thank you</h1>
          <p className="mt-3 text-sm text-neutral-700">
            Your skills profile is complete. We'll use it to match you with
            training programs and job opportunities that fit your skills and
            location.
          </p>
          <p className="mt-2 text-xs text-neutral-500" title={submissionUid}>
            Reference: {shortRef}
          </p>
        </div>
        <Link
          to="/"
          className="mt-6 block rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary-700"
        >
          Done
        </Link>
      </CenteredCard>
    );
  }

  if (formQuery.isLoading) {
    return (
      <CenteredCard testId="supplemental-loading">
        <div className="space-y-4">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-32 animate-pulse rounded bg-neutral-100" />
        </div>
      </CenteredCard>
    );
  }

  // H2 fix — distinguish fetch ERROR (server / network failure) from
  // legitimate empty state (no public form configured). Different copy +
  // testIds so the user knows whether to retry or give up.
  if (formQuery.isError) {
    return (
      <CenteredCard testId="supplemental-fetch-error">
        <h1 className="text-xl font-semibold text-neutral-900">Couldn't load the survey</h1>
        <p className="mt-3 text-sm text-neutral-700">
          We hit a problem loading the questionnaire. Please refresh this page
          in a moment, or contact support if the issue persists.
        </p>
      </CenteredCard>
    );
  }

  if (!form) {
    return (
      <CenteredCard testId="supplemental-no-form">
        <h1 className="text-xl font-semibold text-neutral-900">Survey not available</h1>
        <p className="mt-3 text-sm text-neutral-700">
          The supplemental questionnaire isn't currently configured. Please try
          again later or contact support.
        </p>
      </CenteredCard>
    );
  }

  const mutationError = submitMutation.error as Error | ApiError | undefined;
  let friendlyError: { title: string; body: string } | null = null;
  if (mutationError) {
    const code = mutationError instanceof ApiError ? mutationError.code ?? null : null;
    friendlyError = friendlyErrorCopy(code);
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Complete your skills profile
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            One question at a time. Takes about 3 minutes. Your registration
            details (name, phone, NIN, LGA) are already saved — we just need
            your skills information to match you with the right opportunities.
          </p>
        </header>

        <FormRenderer
          formSchema={form}
          initialResponses={initialResponses}
          onComplete={(all) => {
            // L11 fix — defense-in-depth: do not re-fire while a submit is
            // already in flight. FormRenderer typically gates this itself,
            // but a page-level guard is cheap.
            if (submitMutation.isPending || submitMutation.isSuccess) return;
            submitMutation.mutate(all);
          }}
        />

        {friendlyError && (
          // M6 — aria-live ensures screen-readers announce the error inline.
          <div
            className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-3"
            data-testid="supplemental-error"
            role="alert"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-rose-900">{friendlyError.title}</p>
            <p className="mt-1 text-sm text-rose-800">{friendlyError.body}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function friendlyErrorCopy(code: string | null): { title: string; body: string } {
  switch (code) {
    case 'MAGIC_LINK_EXPIRED':
      return {
        title: 'This link has expired',
        body: 'For your security, links expire after 14 days. Please contact support if you still wish to complete your skills profile.',
      };
    case 'MAGIC_LINK_ALREADY_USED':
      return {
        title: 'This link has already been used',
        body: 'Each link can only be used once. If you need to make changes, please contact support.',
      };
    case 'SUPPLEMENTAL_ALREADY_SUBMITTED':
      return {
        title: 'You already completed this',
        body: 'Your skills profile is already on file. Thank you.',
      };
    case 'SUPPLEMENTAL_TOKEN_NO_RESPONDENT':
      return {
        title: 'Link not recognised',
        body: 'This link is not associated with a registered profile. Please contact support.',
      };
    default:
      return {
        title: 'Something went wrong',
        body: 'We couldn\'t save your answers right now. Please try again in a moment, or contact support.',
      };
  }
}

function CenteredCard({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-16">
      <div
        className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}
