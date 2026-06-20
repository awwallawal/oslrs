/**
 * Public User Dashboard Home — registration-status state machine.
 *
 * Story 9-40 (replaces the legacy Story 2.5-8 mock). Renders off the
 * authenticated `GET /me/registration-status` read-model (Story 9-38) with four
 * states — none / draft / pending_nin / complete — so a logged-in public user
 * always sees their REAL state and a working next action, instead of the old
 * hardcoded "2 of 5 steps" + "Start Survey" card that predated the wizard.
 *
 * Re-entry (Story 9-60): resume / pending-NIN / edit all go IN-SESSION to the
 * authenticated wizard at `/registration/manage` — no magic-link email round-trip
 * (this closes 9-40 review M1). The completed-state marketplace consent is also
 * editable inline via the audited `PUT /me/registration` (9-40 AC#4); full
 * survey-answer/identity editing is the wizard at `/registration/manage` (9-60,
 * closes 9-40 M2).
 */

import { Link } from 'react-router-dom';
import {
  UserPlus,
  ClipboardEdit,
  Fingerprint,
  CheckCircle2,
  Briefcase,
  MapPin,
  Pencil,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { SkeletonCard } from '../../../components/skeletons';
import { useRegistrationStatus } from '../hooks/useRegistrationStatus';
import { useUpdateMarketplaceConsent } from '../hooks/useUpdateMarketplaceConsent';
import type { RegistrationStatusRespondentSummary } from '../api/me.api';

/** Where authenticated resume / pending-NIN / edit all land (Story 9-60). */
const MANAGE_PATH = '/registration/manage';

function PageHeader() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-brand font-semibold text-neutral-900">My Dashboard</h1>
      <p className="text-neutral-600 mt-1">Your registration status and marketplace</p>
    </div>
  );
}

/**
 * A primary CTA that opens the authenticated wizard at `/registration/manage`
 * (Story 9-60) — in-session resume / pending-NIN / edit, no email round-trip.
 */
function ManageButton({ label, testId }: { label: string; testId: string }) {
  return (
    <Button
      asChild
      size="lg"
      className="w-full min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
    >
      <Link to={MANAGE_PATH} data-testid={testId}>
        {label}
      </Link>
    </Button>
  );
}

/** Marketplace status surface (AC#5) — honest opt-in state + inline toggle (AC#4). */
function MarketplaceCard({ respondent }: { respondent: RegistrationStatusRespondentSummary }) {
  const optedIn = respondent.consentMarketplace;
  const mutation = useUpdateMarketplaceConsent();

  return (
    <Card className="h-full" data-testid="marketplace-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Briefcase className="w-5 h-5 text-purple-600" />
          </div>
          <CardTitle className="text-base">Skills Marketplace</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-700 mb-3" data-testid="marketplace-status">
          {optedIn
            ? 'You are opted in — employers can discover your skills profile.'
            : 'You are not opted in to the Skills Marketplace.'}
        </p>
        <Button
          onClick={() => mutation.mutate({ consentMarketplace: !optedIn })}
          disabled={mutation.isPending}
          size="lg"
          variant={optedIn ? 'outline' : 'default'}
          className="w-full min-h-[44px] font-semibold rounded-lg"
          data-testid="marketplace-toggle"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {optedIn ? 'Opt out of the marketplace' : 'Opt in to the marketplace'}
        </Button>
      </CardContent>
    </Card>
  );
}

const NIN_STATUS_LABEL: Record<RegistrationStatusRespondentSummary['ninStatus'], string> = {
  provided: 'Provided',
  pending: 'Pending — add to finish',
  none: 'Not provided',
};

/** Read-only summary of the submitted registration (AC#4 view). */
function RegistrationSummaryCard({
  respondent,
}: {
  respondent: RegistrationStatusRespondentSummary;
}) {
  return (
    <Card className="h-full lg:col-span-2" data-testid="registration-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <CardTitle className="text-base">Registration complete</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Application reference</dt>
            <dd className="font-mono font-medium text-neutral-900 select-all" data-testid="summary-reference">
              {respondent.referenceCode ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500 flex items-center gap-1">
              <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" /> NIN
            </dt>
            <dd className="font-medium text-neutral-900" data-testid="summary-nin-status">
              {NIN_STATUS_LABEL[respondent.ninStatus]}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> LGA
            </dt>
            <dd className="font-medium text-neutral-900" data-testid="summary-lga">
              {respondent.lgaId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="font-medium text-neutral-900" data-testid="summary-status">
              {respondent.status}
            </dd>
          </div>
        </dl>
        <Button asChild variant="outline" className="w-full sm:w-auto" >
          <Link to={MANAGE_PATH} data-testid="edit-registration">
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit my registration
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StateCard({
  icon,
  tone,
  title,
  children,
  testId,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card className="h-full lg:col-span-2" data-testid={testId}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${tone}`}>{icon}</div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function PublicUserHome() {
  const { data, isLoading, isError, refetch } = useRegistrationStatus();

  return (
    <div className="p-6" data-testid="public-user-home">
      <PageHeader />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard className="h-full lg:col-span-2" />
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full lg:col-span-2" />
          <SkeletonCard className="h-full" />
        </div>
      ) : isError || !data ? (
        <Card data-testid="reg-status-error">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-neutral-700">
              We couldn't load your registration status right now.
            </p>
            <Button variant="outline" onClick={() => refetch()} data-testid="reg-status-retry">
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.state === 'none' && (
            <StateCard
              testId="reg-state-none"
              tone="bg-blue-100"
              icon={<UserPlus className="w-5 h-5 text-blue-600" />}
              title="Let's get you registered"
            >
              <p className="text-sm text-neutral-600 mb-3">
                You haven't started your registration yet. It takes about 5 minutes.
              </p>
              <Button
                asChild
                size="lg"
                className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
              >
                <Link to="/register" data-testid="start-registration">
                  Start registration
                </Link>
              </Button>
            </StateCard>
          )}

          {data.state === 'draft' && (
            <StateCard
              testId="reg-state-draft"
              tone="bg-blue-100"
              icon={<ClipboardEdit className="w-5 h-5 text-blue-600" />}
              title={`Continue your registration${
                typeof data.draftStep === 'number' ? ` — Step ${data.draftStep}` : ''
              }`}
            >
              <p className="text-sm text-neutral-600 mb-3">
                You have a registration in progress. Pick up exactly where you left off.
              </p>
              <ManageButton label="Continue registration" testId="resume-draft" />
            </StateCard>
          )}

          {data.state === 'pending_nin' && (
            <StateCard
              testId="reg-state-pending-nin"
              tone="bg-amber-100"
              icon={<Fingerprint className="w-5 h-5 text-amber-600" />}
              title="Add your NIN to finish"
            >
              <p className="text-sm text-neutral-600 mb-3">
                Your registration is saved
                {data.respondent?.referenceCode ? (
                  <>
                    {' '}
                    (reference{' '}
                    <span className="font-mono font-medium">{data.respondent.referenceCode}</span>)
                  </>
                ) : null}
                . Add your National Identification Number to complete it.
              </p>
              <ManageButton label="Add my NIN" testId="resume-pending-nin" />
            </StateCard>
          )}

          {data.state === 'complete' && data.respondent && (
            <>
              <RegistrationSummaryCard respondent={data.respondent} />
              <MarketplaceCard respondent={data.respondent} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
