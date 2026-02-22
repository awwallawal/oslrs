/**
 * RespondentDetailPage — Individual Record PII View
 *
 * Story 5.3: Full respondent detail with submission history and fraud context.
 * PII fields hidden for supervisor role. Direction 08 styling for official route.
 *
 * AC1: Full PII display for authorized roles.
 * AC2: Supervisor sees operational data only (PII absent from API response).
 * AC4: Submission history with fraud context.
 * AC5: Fraud severity badge clickable → navigates to fraud evidence panel.
 * AC6: Skeleton screens matching content shape.
 * AC9: Back button + breadcrumb.
 * AC10: Direction 08 styling for official route.
 */

import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, FileText, Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { FraudSeverityBadge } from '../components/FraudSeverityBadge';
import { FraudResolutionBadge } from '../components/FraudResolutionBadge';
import { RespondentDetailSkeleton } from '../components/RespondentDetailSkeleton';
import { useRespondentDetail } from '../hooks/useRespondent';
import { useAuth } from '../../auth';
import type { SubmissionSummary } from '@oslsr/types';

// ── Processing status badge ──────────────────────────────────────────

function ProcessingStatusBadge({ processed, error }: { processed: boolean; error: string | null }) {
  if (error) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
        Error
      </span>
    );
  }
  if (processed) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        Processed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
      Pending
    </span>
  );
}

// ── Source channel badge ─────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  enumerator: { label: 'Enumerator', className: 'bg-blue-100 text-blue-700' },
  public: { label: 'Public', className: 'bg-purple-100 text-purple-700' },
  clerk: { label: 'Clerk', className: 'bg-teal-100 text-teal-700' },
  webapp: { label: 'Web App', className: 'bg-blue-100 text-blue-700' },
  mobile: { label: 'Mobile', className: 'bg-indigo-100 text-indigo-700' },
  manual: { label: 'Manual', className: 'bg-gray-100 text-gray-700' },
};

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source] ?? { label: source, className: 'bg-neutral-100 text-neutral-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.className}`}>
      {config.label}
    </span>
  );
}

// ── Consent badge ────────────────────────────────────────────────────

function ConsentBadge({ granted, label }: { granted: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
        granted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {granted ? 'Yes' : 'No'} — {label}
    </span>
  );
}

// ── Info row helper ──────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b border-neutral-100 last:border-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className={`text-sm font-medium text-neutral-900 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────

export default function RespondentDetailPage() {
  const { respondentId } = useParams<{ respondentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isOfficialRoute = location.pathname.includes('/official/');
  const isSupervisorView = user?.role === 'supervisor';
  const breadcrumbParent = location.pathname.includes('/assessor/') ? 'Audit Queue'
    : location.pathname.includes('/supervisor/') ? 'Team'
    : location.pathname.includes('/official/') ? 'Registry'
    : 'Dashboard';

  const { data: detail, isLoading, isError } = useRespondentDetail(respondentId ?? '');

  // Determine the fraud review navigation path based on current role
  const getFraudReviewPath = (submission: SubmissionSummary) => {
    if (!submission.fraudDetectionId) return null;
    const basePath = location.pathname.split('/respondent/')[0];
    if (location.pathname.includes('/assessor/')) {
      return `${basePath}/queue?detection=${submission.fraudDetectionId}`;
    }
    if (location.pathname.includes('/supervisor/')) {
      return `${basePath}/fraud?detection=${submission.fraudDetectionId}`;
    }
    // Super admin and official don't have fraud detail routes — badge is non-clickable
    return null;
  };

  if (isLoading) {
    return <RespondentDetailSkeleton />;
  }

  if (isError || !detail) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-12 h-12 text-red-300 mb-4" />
          <p className="text-red-600 font-medium">Failed to load respondent details</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const displayName = detail.firstName && detail.lastName
    ? `${detail.firstName} ${detail.lastName}`
    : 'Record Details';

  return (
    <div className="p-6">
      {/* Header with back button and breadcrumb */}
      {isOfficialRoute ? (
        <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-gray-700"
              onClick={() => navigate(-1)}
              data-testid="back-button"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">
                {breadcrumbParent} &rsaquo; Respondent Detail
              </p>
              <h1 className="text-2xl font-brand font-semibold">{displayName}</h1>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              data-testid="back-button"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <p className="text-sm text-neutral-500">
              {breadcrumbParent} &rsaquo; Respondent Detail
            </p>
          </div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">{displayName}</h1>
          <p className="text-neutral-600 mt-1">
            Registered {new Date(detail.createdAt).toLocaleDateString()}
          </p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {/* Personal Information Card — PII-authorized roles only */}
        {!isSupervisorView && (
          <Card className={isOfficialRoute ? 'bg-gray-50 border-gray-200' : ''} data-testid="pii-card">
            {isOfficialRoute ? (
              <CardHeader className="border-l-4 border-[#9C1E23] ml-0 pl-4">
                <CardTitle className="text-sm uppercase tracking-wider text-neutral-700">Personal Information</CardTitle>
              </CardHeader>
            ) : (
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
              </CardHeader>
            )}
            <CardContent className="space-y-1">
              <InfoRow label="Full Name" value={`${detail.firstName} ${detail.lastName}`} />
              <InfoRow label="NIN" value={detail.nin} mono />
              <InfoRow label="Phone Number" value={detail.phoneNumber} />
              <InfoRow label="Date of Birth" value={detail.dateOfBirth} />
              <InfoRow label="LGA" value={detail.lgaName} />
              <div className="flex justify-between py-2 border-b border-neutral-100">
                <span className="text-sm text-neutral-500">Source</span>
                <SourceBadge source={detail.source} />
              </div>
              <div className="flex justify-between py-2 border-b border-neutral-100">
                <span className="text-sm text-neutral-500">Consent</span>
                <div className="flex gap-2">
                  <ConsentBadge granted={detail.consentMarketplace} label="Marketplace" />
                  <ConsentBadge granted={detail.consentEnriched} label="Enriched" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Operational Information Card — all roles */}
        <Card className={isOfficialRoute ? 'bg-gray-50 border-gray-200' : ''} data-testid="operational-card">
          {isOfficialRoute ? (
            <CardHeader className="border-l-4 border-[#9C1E23] ml-0 pl-4">
              <CardTitle className="text-sm uppercase tracking-wider text-neutral-700">Operational Information</CardTitle>
            </CardHeader>
          ) : (
            <CardHeader>
              <CardTitle className="text-lg">Operational Information</CardTitle>
            </CardHeader>
          )}
          <CardContent className="space-y-1">
            <InfoRow label="LGA" value={detail.lgaName} />
            <div className="flex justify-between py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-500">Source Channel</span>
              <SourceBadge source={detail.source} />
            </div>
            <InfoRow label="Registration Date" value={new Date(detail.createdAt).toLocaleDateString()} />
            <InfoRow label="Total Submissions" value={String(detail.submissions.length)} />
          </CardContent>
        </Card>

        {/* Fraud Summary Card — if any fraud detections exist */}
        {detail.fraudSummary && (
          <Card className={isOfficialRoute ? 'bg-gray-50 border-gray-200' : ''} data-testid="fraud-summary-card">
            {isOfficialRoute ? (
              <CardHeader className="border-l-4 border-[#9C1E23] ml-0 pl-4">
                <CardTitle className="text-sm uppercase tracking-wider text-neutral-700">Fraud Summary</CardTitle>
              </CardHeader>
            ) : (
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-neutral-400" />
                  Fraud Summary
                </CardTitle>
              </CardHeader>
            )}
            <CardContent>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Highest Severity</p>
                  <FraudSeverityBadge severity={detail.fraudSummary.highestSeverity} />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Flagged Submissions</p>
                  <span className="text-lg font-semibold text-neutral-900">
                    {detail.fraudSummary.flaggedSubmissionCount}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Latest Resolution</p>
                  <FraudResolutionBadge resolution={detail.fraudSummary.latestResolution} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Submission History Section */}
      <Card className={isOfficialRoute ? 'bg-gray-50 border-gray-200' : ''}>
        {isOfficialRoute ? (
          <CardHeader className="border-l-4 border-[#9C1E23] ml-0 pl-4">
            <CardTitle className="text-sm uppercase tracking-wider text-neutral-700">
              Submission History
            </CardTitle>
          </CardHeader>
        ) : (
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-neutral-400" />
              Submission History
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="p-0">
          {detail.submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-submissions">
              <FileText className="w-10 h-10 text-neutral-300 mb-3" />
              <p className="text-neutral-500 font-medium">No submissions found for this respondent</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="submissions-table">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">#</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Submitted Date</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Form Name</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Enumerator</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Fraud Score</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.submissions.map((submission, index) => {
                    const fraudPath = getFraudReviewPath(submission);
                    return (
                      <tr key={submission.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-4 py-3 text-neutral-500">{index + 1}</td>
                        <td className="px-4 py-3 text-neutral-900">
                          {new Date(submission.submittedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-neutral-900">{submission.formName || '—'}</td>
                        <td className="px-4 py-3">
                          <SourceBadge source={submission.source} />
                        </td>
                        <td className="px-4 py-3 text-neutral-900">{submission.enumeratorName || '—'}</td>
                        <td className="px-4 py-3">
                          <ProcessingStatusBadge processed={submission.processed} error={submission.processingError} />
                        </td>
                        <td className="px-4 py-3">
                          {submission.fraudSeverity ? (
                            fraudPath ? (
                              <button
                                onClick={() => navigate(fraudPath)}
                                className="cursor-pointer hover:opacity-80"
                                data-testid="fraud-badge-link"
                              >
                                <FraudSeverityBadge severity={submission.fraudSeverity} />
                              </button>
                            ) : (
                              <FraudSeverityBadge severity={submission.fraudSeverity} />
                            )
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
